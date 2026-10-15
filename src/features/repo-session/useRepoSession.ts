import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { api } from "@/shared/tauri/api";
import {
  resolveComparisonPrefs,
  shouldLoadOverview,
} from "@/features/settings/comparisonPrefs";
import { orderedPaths } from "@/features/changed-files/order";
import {
  FILE_DIFF_BATCH_CONCURRENCY,
  FILE_DIFF_BATCH_SIZE,
  loadAllFileDiffs,
} from "@/features/branch-compare/loadAllFileDiffs";
import { pushRecent } from "@/features/settings/settings";
import {
  isRemoteUrl,
  redactUrl,
  reviewUrlFor,
} from "@/features/remote/remoteUrl";
import type {
  AppSettings,
  OpenRepoResult,
  RemoteOpenResult,
  RepoInfo,
} from "@/shared/types/app";
import {
  makeComparisonKey,
  sliceComparisonKey,
  type ComparisonKey,
} from "@/features/branch-compare/comparisonKey";
import {
  sameHistorySpec,
  type HistorySlice,
} from "@/features/history/historyModel";
import {
  CONCURRENT_LOAD_CAP,
  HOT_CAP,
  idleCallback,
  stampsMatch,
} from "./sessionHelpers";
import {
  activeGroupFromState,
  activeMergeBaseFromState,
  activeReviewStampFromState,
  activeRowFromState,
  lruHotKeyToDemote,
  sessionReducer,
} from "./sessionReducer";
import {
  decideAfterStamp,
  decideBeforeStamp,
  hasLoadedStamp,
  type StalenessInput,
} from "./staleness";
import {
  emptyComparisonRow,
  specOf,
  type ComparisonRow,
  type ComparisonSpec,
  type MultiSessionState,
  type RemoteOpen,
  type Residency,
  type WorkspaceGroup,
  type WorkspaceId,
} from "./types";
import {
  buildInitialState,
  pendingRemoteWorkspaces,
  stateToWorkspaceTree,
  withPendingWorkspaces,
  type PendingRemoteWorkspace,
} from "./workspaceTreeCodec";

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

type RemoteRecovery = PendingRemoteWorkspace & { failed: boolean };

/**
 * The first persisted follower that is open now, so a restored workspace lands
 * back in its persisted place. `recovered` maps persisted clone paths to the
 * paths their recoveries landed at.
 */
function persistedSuccessor(
  followers: readonly string[],
  groups: MultiSessionState["groups"],
  recovered: ReadonlyMap<string, WorkspaceId>,
): WorkspaceId | undefined {
  return followers
    .map((path) => recovered.get(path) ?? path)
    .find((id) => groups[id] != null);
}

/**
 * A fresh clone has branches only. Fetch the reviews (`pr/N`, `mr/N`) that
 * persisted comparisons use, one at a time since they share the clone.
 * Failures are skipped; that comparison shows its own load error.
 */
async function refetchReviews(
  repoUrl: string,
  comparisons: { baseBranch: string; headBranch: string }[],
  branches: string[],
): Promise<string[]> {
  const known = new Set(branches);
  const urls = new Set<string>();
  for (const { baseBranch, headBranch } of comparisons) {
    for (const label of [baseBranch, headBranch]) {
      const url = reviewUrlFor(repoUrl, label);
      if (url && !known.has(label)) urls.add(url);
    }
  }
  return [...urls].reduce<Promise<string[]>>(
    (prev, url) =>
      prev.then((latest) =>
        api.openRemoteRepository(url).then(
          (result) => result.opened.branches,
          (e: unknown) => {
            console.error("review re-fetch failed:", redactUrl(url), errorMessage(e));
            return latest;
          },
        ),
      ),
    Promise.resolve(branches),
  );
}

function loadTokenFor(state: MultiSessionState): string | null {
  const key = state.activeKey;
  if (!key) return null;
  const row = state.comparisons[key];
  if (!row) return key;
  const spec = specOf(row);
  return `${key}\0${spec.base}\0${spec.head}\0${row.history?.kind ?? ""}`;
}

function snapshotOf(
  row: ComparisonRow,
  key: ComparisonKey,
  activeKey: ComparisonKey | null,
): StalenessInput {
  return {
    isLive: row.isLive,
    outdated: row.outdated,
    residency: row.residency,
    hasFileDiffs: row.fileDiffs.length > 0,
    isActive: key === activeKey,
    hasLoaded: hasLoadedStamp(row),
  };
}

export function useRepoSessionState(
  settings: AppSettings,
  update: (patch: Partial<AppSettings>) => Promise<void>,
  opened: OpenRepoResult | null = null,
  openedWorkspaces: OpenRepoResult[] = [],
  cliOpenedPaths: string[] = [],
  cliRemoteUrls: string[] = [],
) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    { opened, openedWorkspaces, settings, cliOpenedPaths },
    (init) =>
      buildInitialState(
        init.opened,
        init.openedWorkspaces,
        init.settings,
        init.cliOpenedPaths,
      ),
  );

  const [remoteOpens, setRemoteOpens] = useState<RemoteOpen[]>([]);
  // Persisted remote workspaces whose clone did not open. Each is re-cloned
  // after first paint and stays persisted until it is restored or dismissed.
  const [launchRecoveries] = useState(() => {
    const openedPaths = new Set(openedWorkspaces.map((o) => o.repo.path));
    if (opened) openedPaths.add(opened.repo.path);
    return pendingRemoteWorkspaces(settings.workspaceTree, openedPaths);
  });
  const [recoveries, setRecoveries] = useState<RemoteRecovery[]>(() =>
    launchRecoveries.map((entry) => ({ ...entry, failed: false })),
  );
  // Persisted clone paths handed to recovery. Their startup open errors are
  // reported through `remoteOpens` instead.
  const recoveryPaths = useMemo(
    () => launchRecoveries.map((entry) => entry.workspace.repoPath),
    [launchRecoveries],
  );
  const remoteInFlight = useRef(new Set<string>());
  // Persisted clone path to the path a recovery restored it under.
  const recoveredPaths = useRef(new Map<string, WorkspaceId>());
  const refreshGenByKey = useRef(new Map<ComparisonKey, number>());
  const inFlightLoads = useRef(0);
  const metadataInFlight = useRef(new Set<string>());
  const stateRef = useRef(state);
  const launchActiveKey = useRef(state.activeKey);
  const recoveriesRef = useRef(recoveries);
  useLayoutEffect(() => {
    stateRef.current = state;
    recoveriesRef.current = recoveries;
  });
  // Async work (a clone can take minutes) reads settings when it applies
  // results, so it never writes back a snapshot from when it started.
  const settingsRef = useRef(settings);
  useLayoutEffect(() => {
    settingsRef.current = settings;
  });

  const activeRow = activeRowFromState(state);
  const activeGroup = activeGroupFromState(state);

  const enforceHotCap = useCallback((protectKey?: ComparisonKey) => {
    let hotCount = Object.values(stateRef.current.comparisons).filter(
      (r) => r.residency === "hot",
    ).length;
    while (hotCount > HOT_CAP) {
      const victim = lruHotKeyToDemote(stateRef.current, protectKey);
      if (!victim) break;
      dispatch({ type: "demote-hot-to-warm", key: victim });
      hotCount -= 1;
    }
  }, []);

  const loadComparison = useCallback(
    async (key: ComparisonKey, target: "warm" | "hot") => {
      const row = stateRef.current.comparisons[key];
      const group = row ? stateRef.current.groups[row.repoPath] : null;
      if (!row || !group || !shouldLoadOverview(row.repoPath)) return;

      const prevGen = refreshGenByKey.current.get(key) ?? 0;
      const gen = prevGen + 1;
      refreshGenByKey.current.set(key, gen);
      const isStale = () => refreshGenByKey.current.get(key) !== gen;

      while (inFlightLoads.current >= CONCURRENT_LOAD_CAP) {
        await new Promise((r) => setTimeout(r, 50));
        if (isStale()) return;
      }
      inFlightLoads.current += 1;

      dispatch({ type: "comparison-loading", key, loading: true });
      dispatch({ type: "comparison-error", key, error: null });

      try {
        const spec = specOf(row);
        const { repoPath } = row;
        const overview = await api.getBranchOverview(repoPath, spec.base, spec.head);
        if (isStale()) return;

        dispatch({ type: "comparison-overview", key, overview });

        if (target === "hot") {
          const paths = orderedPaths(overview.files.map((f) => f.path));
          await loadAllFileDiffs({
            paths,
            batchSize: FILE_DIFF_BATCH_SIZE,
            concurrency: FILE_DIFF_BATCH_CONCURRENCY,
            fetchBatch: (batchPaths) =>
              api.getBranchFileDiffs(repoPath, spec.base, spec.head, batchPaths),
            onBatch: (fileDiffs) => {
              if (!isStale()) {
                dispatch({ type: "append-file-diffs", key, fileDiffs });
              }
            },
            isStale,
          });
        }

        if (!isStale() && target === "hot") {
          enforceHotCap(key);
        }
      } catch (e) {
        if (!isStale()) {
          const message = e instanceof Error ? e.message : String(e);
          dispatch({ type: "comparison-error", key, error: message });
          console.error("loadComparison failed:", e);
        }
      } finally {
        inFlightLoads.current = Math.max(0, inFlightLoads.current - 1);
        if (!isStale()) {
          dispatch({ type: "comparison-loading", key, loading: false });
        }
      }
    },
    [enforceHotCap],
  );

  const ensureLoaded = useCallback(
    async (key: ComparisonKey) => {
      const row = stateRef.current.comparisons[key];
      if (!row) return;
      const pre = decideBeforeStamp(
        snapshotOf(row, key, stateRef.current.activeKey),
      );
      if (pre === "load") {
        await loadComparison(key, "hot");
        return;
      }
      if (pre === "skip") return;
      const spec = specOf(row);
      // A history scrub retargets this key while the stamp is in flight.
      const specMoved = () => {
        const current = stateRef.current.comparisons[key];
        if (!current) return true;
        const latest = specOf(current);
        return latest.base !== spec.base || latest.head !== spec.head;
      };
      try {
        const stamp = await api.getComparisonStamp(
          row.repoPath,
          spec.base,
          spec.head,
        );
        const current = stateRef.current.comparisons[key];
        if (!current || specMoved()) return;
        const decision = decideAfterStamp({
          ...snapshotOf(current, key, stateRef.current.activeKey),
          stampsMatch: stampsMatch(current, stamp),
        });
        if (decision === "mark-outdated-load") {
          dispatch({ type: "mark-outdated", key, outdated: true });
        }
        if (decision !== "skip") await loadComparison(key, "hot");
      } catch (e) {
        console.error("ensureLoaded stamp check failed:", e);
        if (specMoved()) return;
        await loadComparison(key, "hot");
      }
    },
    [loadComparison],
  );

  /** `remoteOpens` rows are keyed by the redacted URL. */
  const setRemoteError = useCallback((url: string, error: string | null) => {
    setRemoteOpens((list) => {
      const rest = list.filter((r) => r.url !== url);
      return error == null ? rest : [...rest, { url, error }];
    });
  }, []);

  /** Fetch a remote workspace's clone so refresh sees new commits. */
  const fetchRemote = useCallback(
    async (repo: RepoInfo) => {
      const url = redactUrl(repo.remoteUrl ?? repo.path);
      try {
        const opened = await api.fetchRemoteRepository(repo.path);
        dispatch({ type: "update-repo", workspaceId: repo.path, repo: opened.repo });
        dispatch({
          type: "branches",
          workspaceId: repo.path,
          branches: opened.branches,
          settings: settingsRef.current,
        });
        setRemoteError(url, null);
      } catch (e) {
        const message = errorMessage(e);
        console.error(`remote fetch failed for ${url}:`, message);
        setRemoteError(url, `Could not fetch: ${message}`);
      }
    },
    [setRemoteError],
  );

  const refreshOverview = useCallback(
    async (key?: ComparisonKey) => {
      const targetKey = key ?? stateRef.current.activeKey;
      if (!targetKey) return;
      dispatch({ type: "mark-outdated", key: targetKey, outdated: true });
      const row = stateRef.current.comparisons[targetKey];
      const repo = row ? stateRef.current.groups[row.repoPath]?.repo : undefined;
      if (repo?.remoteUrl) {
        dispatch({ type: "comparison-loading", key: targetKey, loading: true });
        await fetchRemote(repo);
      }
      await loadComparison(targetKey, "hot");
    },
    [fetchRemote, loadComparison],
  );

  /** Trailing-debounce (~1s) meta refresh: single in-flight + dirty flag. */
  const overviewMetaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewMetaInFlight = useRef(false);
  const overviewMetaDirty = useRef(false);
  const overviewMetaKey = useRef<ComparisonKey | null>(null);

  const runOverviewMetaRefresh = useCallback(async () => {
    if (overviewMetaInFlight.current) {
      overviewMetaDirty.current = true;
      return;
    }
    const targetKey = overviewMetaKey.current ?? stateRef.current.activeKey;
    if (!targetKey) {
      overviewMetaDirty.current = false;
      return;
    }
    overviewMetaDirty.current = false;
    overviewMetaInFlight.current = true;
    const row = stateRef.current.comparisons[targetKey];
    if (!row) {
      overviewMetaInFlight.current = false;
      return;
    }
    try {
      const spec = specOf(row);
      const overview = await api.getBranchOverview(
        row.repoPath,
        spec.base,
        spec.head,
      );
      if (!stateRef.current.comparisons[targetKey]) return;
      dispatch({ type: "patch-overview", key: targetKey, overview });
    } catch (e) {
      console.error("overview meta refresh failed:", e);
    } finally {
      overviewMetaInFlight.current = false;
      if (overviewMetaDirty.current) {
        void runOverviewMetaRefresh();
      }
    }
  }, []);

  /** Refresh file-list badges without tearing down CodeView items (after a working-tree save). */
  const refreshOverviewMeta = useCallback((key?: ComparisonKey) => {
    overviewMetaKey.current = key ?? stateRef.current.activeKey;
    overviewMetaDirty.current = true;
    if (overviewMetaTimer.current) clearTimeout(overviewMetaTimer.current);
    overviewMetaTimer.current = setTimeout(() => {
      overviewMetaTimer.current = null;
      void runOverviewMetaRefresh();
    }, 1000);
  }, [runOverviewMetaRefresh]);

  const warmIdleKeys = useCallback(() => {
    if (settings.launchMode === "empty") return;
    const activeKey = stateRef.current.activeKey;
    for (const row of Object.values(stateRef.current.comparisons)) {
      if (row.key === activeKey) continue;
      if (row.residency !== "cold") continue;
      idleCallback(() => void loadComparison(row.key, "warm"));
    }
  }, [loadComparison, settings.launchMode]);

  // JSON stringify guard: skip persist on every append-file-diffs batch.
  const persistedTreeJson = useRef<string | null>(null);
  useEffect(() => {
    // A pending workspace keeps its active comparison until the user picks another.
    const tree = withPendingWorkspaces(
      stateToWorkspaceTree(state),
      recoveries,
      state.activeKey === launchActiveKey.current,
    );
    const json = JSON.stringify(tree);
    if (json === persistedTreeJson.current) return;
    persistedTreeJson.current = json;
    void update({ workspaceTree: tree });
  }, [state, recoveries, update]);

  const seededCliRecents = useRef(false);
  useEffect(() => {
    if (seededCliRecents.current || cliOpenedPaths.length === 0) return;
    seededCliRecents.current = true;
    let recentRepos = settings.recentRepos;
    for (let i = cliOpenedPaths.length - 1; i >= 0; i--) {
      recentRepos = pushRecent(
        { ...settings, recentRepos },
        cliOpenedPaths[i]!,
      ).recentRepos;
    }
    const same =
      recentRepos.length === settings.recentRepos.length &&
      recentRepos.every((path, i) => path === settings.recentRepos[i]);
    if (!same) {
      void update({ recentRepos });
    }
  }, [cliOpenedPaths, settings, update]);

  const activeLoadToken = loadTokenFor(state);
  useEffect(() => {
    const key = state.activeKey;
    if (!key) return;
    void ensureLoaded(key);
  }, [activeLoadToken, ensureLoaded, state.activeKey]);

  // Idle-warm remaining rows after the active load has a chance to start.
  useEffect(() => {
    if (!state.activeKey) return;
    idleCallback(() => warmIdleKeys());
  }, [state.activeKey, warmIdleKeys]);

  // Focus revalidation: stamp check only, never recompute.
  useEffect(() => {
    const onFocus = () => {
      const current = stateRef.current;
      for (const row of Object.values(current.comparisons)) {
        if (row.isLive) continue;
        const spec = specOf(row);
        void api
          .getComparisonStamp(row.repoPath, spec.base, spec.head)
          .then((stamp) => {
            const latest = stateRef.current.comparisons[row.key];
            if (!latest || latest.isLive) return;
            const latestSpec = specOf(latest);
            if (latestSpec.base !== spec.base || latestSpec.head !== spec.head) return;
            if (hasLoadedStamp(latest) && !stampsMatch(latest, stamp)) {
              dispatch({ type: "mark-outdated", key: row.key, outdated: true });
            }
          })
          .catch((e) => console.error("focus stamp check failed:", e));
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /**
   * Add the workspace if new, then spawn and activate one comparison: the
   * requested one, or the saved base/head preferences.
   */
  const admitWorkspace = useCallback(
    async (
      info: RepoInfo,
      branches: string[],
      recent: string,
      requested?: ComparisonSpec,
      before?: WorkspaceId,
    ) => {
      // Canonical identity: RepoInfo.path is the backend map key. The picker
      // path is only a discovery hint; never use it as a workspace/row key
      // (it can differ, e.g. trailing slash, subdirectory of the workdir).
      const workspaceId = info.path;
      const { base, head } =
        requested ?? resolveComparisonPrefs(settingsRef.current, info, branches);
      const key = makeComparisonKey(workspaceId, base, head);

      const current = stateRef.current;
      if (!current.workspaceOrder.includes(workspaceId)) {
        const group: WorkspaceGroup = {
          repo: info,
          branches,
          collapsed: false,
          comparisonKeys: [],
          branchMetadata: [],
          metadataLoading: false,
        };
        dispatch({ type: "add-workspace", workspaceId, group, before });
      }
      if (!current.comparisons[key]) {
        dispatch({
          type: "spawn-comparison",
          workspaceId,
          key,
          row: emptyComparisonRow(key, workspaceId, base, head),
        });
      }
      dispatch({ type: "activate", key });
      // Narrow {recentRepos} patch composes with the effect's {workspaceTree}
      // patch because `update` merges. The ref takes the new list at once so
      // a second admit before the next render builds on it.
      const next = pushRecent(settingsRef.current, recent);
      settingsRef.current = next;
      await update({ recentRepos: next.recentRepos });
      void ensureLoaded(key);
    },
    [update, ensureLoaded],
  );

  /**
   * Clone or fetch a remote URL and hand the result to `apply`. Progress and
   * failures land in `remoteOpens`; this never throws. Resolves to false on
   * failure and null when the same URL is already syncing.
   */
  const syncRemote = useCallback(
    async (
      input: string,
      apply: (result: RemoteOpenResult) => Promise<void>,
    ): Promise<boolean | null> => {
      // The raw input goes to the backend only. Rows, dedupe, and logs use
      // the redacted form so a token in the URL never reaches the UI.
      const raw = input.trim();
      const url = redactUrl(raw);
      const showSyncing = () =>
        setRemoteOpens((list) => [
          ...list.filter((r) => r.url !== url),
          { url, error: null },
        ]);
      if (remoteInFlight.current.has(url)) {
        // A retry while syncing brings back a dismissed row.
        showSyncing();
        return null;
      }
      remoteInFlight.current.add(url);
      showSyncing();
      try {
        const result = await api.openRemoteRepository(raw);
        const { repo: info, branches } = result.opened;
        if (stateRef.current.groups[info.path]) {
          dispatch({ type: "update-repo", workspaceId: info.path, repo: info });
          dispatch({
            type: "branches",
            workspaceId: info.path,
            branches,
            settings: settingsRef.current,
          });
        }
        await apply(result);
        const canonical = info.remoteUrl ? redactUrl(info.remoteUrl) : url;
        setRemoteOpens((list) =>
          list.filter((r) => r.url !== url && r.url !== canonical),
        );
        return true;
      } catch (e) {
        const message = errorMessage(e);
        console.error(`remote open failed for ${url}:`, message);
        setRemoteError(url, message);
        return false;
      } finally {
        remoteInFlight.current.delete(url);
      }
    },
    [setRemoteError],
  );

  /**
   * Clone or fetch a remote URL, then show it. A pull or merge request URL
   * opens that review against its base.
   */
  const openRemote = useCallback(
    async (input: string) => {
      const url = redactUrl(input.trim());
      await syncRemote(input, async ({ opened, review }) => {
        const { repo: info, branches } = opened;
        // An explicit open supersedes a failed recovery of the same remote
        // and takes its persisted place.
        const canonical = info.remoteUrl ? redactUrl(info.remoteUrl) : url;
        const matches = (r: RemoteRecovery) => {
          const recovered = redactUrl(r.workspace.remoteUrl);
          return recovered === url || recovered === canonical;
        };
        const superseded = recoveriesRef.current.find(matches);
        if (superseded) {
          recoveredPaths.current.set(superseded.workspace.repoPath, info.path);
        }
        setRecoveries((list) => list.filter((r) => !matches(r)));
        await admitWorkspace(
          info,
          branches,
          info.remoteUrl ?? url,
          review ? { base: review.baseBranch, head: review.headBranch } : undefined,
          superseded &&
            persistedSuccessor(
              superseded.followers,
              stateRef.current.groups,
              recoveredPaths.current,
            ),
        );
      });
    },
    [admitWorkspace, syncRemote],
  );

  /**
   * Re-clone a persisted remote workspace and restore its comparisons, re-keyed
   * onto the clone's path, which can differ from the persisted one.
   */
  const recoverRemote = useCallback(
    async (entry: PendingRemoteWorkspace) => {
      const { workspace, active } = entry;
      const ok = await syncRemote(workspace.remoteUrl, async ({ opened }) => {
        const { repo: info } = opened;
        const branches = await refetchReviews(
          workspace.remoteUrl,
          workspace.comparisons,
          opened.branches,
        );
        const workspaceId = info.path;
        recoveredPaths.current.set(workspace.repoPath, workspaceId);
        if (!stateRef.current.groups[workspaceId]) {
          dispatch({
            type: "add-workspace",
            workspaceId,
            before: persistedSuccessor(
              entry.followers,
              stateRef.current.groups,
              recoveredPaths.current,
            ),
            group: {
              repo: info,
              branches,
              collapsed: workspace.collapsed,
              comparisonKeys: [],
              branchMetadata: [],
              metadataLoading: false,
            },
          });
        }
        for (const { baseBranch, headBranch } of workspace.comparisons) {
          const key = makeComparisonKey(workspaceId, baseBranch, headBranch);
          dispatch({
            type: "spawn-comparison",
            workspaceId,
            key,
            row: emptyComparisonRow(key, workspaceId, baseBranch, headBranch),
          });
        }
        // Take focus only when nothing else is shown, or when this held the
        // persisted active comparison and the user has not moved since launch.
        const { activeKey } = stateRef.current;
        const target = active ?? workspace.comparisons[0];
        if (
          target &&
          (activeKey == null ||
            (active != null && activeKey === launchActiveKey.current))
        ) {
          dispatch({
            type: "activate",
            key: makeComparisonKey(workspaceId, target.baseBranch, target.headBranch),
          });
        }
        setRecoveries((list) =>
          list.filter((r) => r.workspace.repoPath !== workspace.repoPath),
        );
      });
      if (ok === false) {
        setRecoveries((list) =>
          list.map((r) =>
            r.workspace.repoPath === workspace.repoPath ? { ...r, failed: true } : r,
          ),
        );
      }
    },
    [syncRemote],
  );

  /**
   * Hides a row. A pending open keeps running and still lands or reports.
   * Dismissing a failed recovery also drops that workspace from the tree.
   */
  const dismissRemoteOpen = useCallback((url: string) => {
    setRemoteOpens((list) => list.filter((r) => r.url !== url));
    setRecoveries((list) =>
      list.filter((r) => !(r.failed && redactUrl(r.workspace.remoteUrl) === url)),
    );
  }, []);

  /** Local folder path or remote URL. */
  const openRepo = useCallback(
    async (pathOrUrl: string) => {
      if (isRemoteUrl(pathOrUrl)) {
        await openRemote(pathOrUrl);
        return;
      }
      const { repo: info, branches } = await api.openRepository(pathOrUrl);
      await admitWorkspace(info, branches, info.path);
    },
    [admitWorkspace, openRemote],
  );

  // Recoveries and CLI remote URLs open after first paint; a clone can take
  // a while. One chain, so a CLI URL for the same remote waits for its
  // recovery instead of colliding with it.
  const startedLaunchRemotes = useRef(false);
  useEffect(() => {
    if (startedLaunchRemotes.current) return;
    if (launchRecoveries.length === 0 && cliRemoteUrls.length === 0) return;
    startedLaunchRemotes.current = true;
    const steps = [
      ...launchRecoveries.map((entry) => () => recoverRemote(entry)),
      // In argument order, so the last URL ends up active.
      ...cliRemoteUrls.map((url) => () => openRemote(url)),
    ];
    void steps.reduce<Promise<void>>(
      (prev, step) => prev.then(step),
      Promise.resolve(),
    );
  }, [cliRemoteUrls, launchRecoveries, openRemote, recoverRemote]);

  const closeWorkspace = useCallback(async (workspaceId: string) => {
    const keys = stateRef.current.groups[workspaceId]?.comparisonKeys ?? [];
    for (const key of keys) {
      refreshGenByKey.current.set(key, (refreshGenByKey.current.get(key) ?? 0) + 1);
    }
    await api.closeRepository(workspaceId);
    dispatch({ type: "close-workspace", workspaceId });
  }, []);

  const closeComparison = useCallback((key: ComparisonKey) => {
    // The reducer also closes the source's history slot, so its loads go stale too.
    for (const k of [key, sliceComparisonKey(key)]) {
      refreshGenByKey.current.set(k, (refreshGenByKey.current.get(k) ?? 0) + 1);
    }
    dispatch({ type: "close-comparison", key });
  }, []);

  const closeRepo = useCallback(async () => {
    const active = activeRowFromState(stateRef.current);
    if (active) await closeWorkspace(active.repoPath);
    else dispatch({ type: "reset" });
  }, [closeWorkspace]);

  const activateComparison = useCallback(
    (key: ComparisonKey) => {
      if (!stateRef.current.comparisons[key]) return;
      dispatch({ type: "activate", key });
      void (async () => {
        const row = stateRef.current.comparisons[key];
        if (!row) return;
        try {
          const opened = await api.openRepository(row.repoPath);
          dispatch({
            type: "update-repo",
            workspaceId: row.repoPath,
            repo: opened.repo,
          });
          dispatch({
            type: "branches",
            workspaceId: row.repoPath,
            branches: opened.branches,
            settings: settingsRef.current,
          });
        } catch (e) {
          console.error("activateComparison open failed:", e);
        }
        void ensureLoaded(key);
      })();
    },
    [ensureLoaded],
  );

  const spawnComparison = useCallback(
    (
      workspaceId: string,
      base: string,
      head: string,
      residency: Residency = "cold",
    ) => {
      const key = makeComparisonKey(workspaceId, base, head);
      if (stateRef.current.comparisons[key]) {
        activateComparison(key);
        return key;
      }
      const row = { ...emptyComparisonRow(key, workspaceId, base, head), residency };
      dispatch({ type: "spawn-comparison", workspaceId, key, row });
      dispatch({ type: "activate", key });
      void ensureLoaded(key);
      return key;
    },
    [activateComparison, ensureLoaded],
  );

  const addWorkspace = openRepo;

  const toggleGroupCollapsed = useCallback((workspaceId: string) => {
    const group = stateRef.current.groups[workspaceId];
    if (!group) return;
    dispatch({
      type: "set-group-collapsed",
      workspaceId,
      collapsed: !group.collapsed,
    });
  }, []);

  const setColumnCollapsed = useCallback((collapsed: boolean) => {
    dispatch({ type: "set-column-collapsed", collapsed });
  }, []);

  const loadBranches = useCallback(async () => {
    const active = activeRowFromState(stateRef.current);
    if (!active) return;
    try {
      const branches = await api.listBranches(active.repoPath);
      dispatch({
        type: "branches",
        workspaceId: active.repoPath,
        branches,
        settings: settingsRef.current,
      });
    } catch (e) {
      console.error("loadBranches failed:", e);
    }
  }, []);

  const loadBranchMetadata = useCallback(async () => {
    const active = activeRowFromState(stateRef.current);
    if (!active?.baseBranch || metadataInFlight.current.has(active.repoPath)) {
      return;
    }
    metadataInFlight.current.add(active.repoPath);
    dispatch({
      type: "branch-metadata-loading",
      workspaceId: active.repoPath,
      loading: true,
    });
    try {
      const metadata = await api.getBranchMetadata(
        active.repoPath,
        active.baseBranch,
      );
      dispatch({
        type: "branch-metadata",
        workspaceId: active.repoPath,
        metadata,
      });
    } catch (e) {
      console.error("loadBranchMetadata failed:", e);
      dispatch({
        type: "branch-metadata-loading",
        workspaceId: active.repoPath,
        loading: false,
      });
    } finally {
      metadataInFlight.current.delete(active.repoPath);
    }
  }, []);

  const handleComparisonChange = useCallback(
    async (next: { head: string; base: string }) => {
      const active = activeRowFromState(stateRef.current);
      if (!active) return;
      if (next.head && next.base && next.head === next.base) return;

      const key = makeComparisonKey(active.repoPath, next.base, next.head);
      if (stateRef.current.comparisons[key]) {
        activateComparison(key);
        return;
      }

      spawnComparison(active.repoPath, next.base, next.head);
      await update({
        baseBranchByRepo: {
          ...settings.baseBranchByRepo,
          [active.repoPath]: next.base,
        },
        headBranchByRepo: {
          ...settings.headBranchByRepo,
          [active.repoPath]: next.head,
        },
      });
      void loadBranchMetadata();
    },
    [
      activateComparison,
      spawnComparison,
      settings.baseBranchByRepo,
      settings.headBranchByRepo,
      update,
      loadBranchMetadata,
    ],
  );

  const applyHistorySlice = useCallback(
    (sourceKey: ComparisonKey, request: HistorySlice | null) => {
      const current = stateRef.current;
      const source = current.comparisons[sourceKey];
      if (source?.history) return;
      const sliceKey = sliceComparisonKey(sourceKey);
      const sliceRow = current.comparisons[sliceKey];
      const repoPath = source?.repoPath ?? sliceRow?.repoPath;
      if (!repoPath) return;

      const existing = sliceRow?.history;
      const specChanged =
        request != null &&
        (existing == null || !sameHistorySpec(existing, request));
      if (specChanged) {
        // The slot key stays put. Bump the generation so an in-flight overview
        // cannot land on the new spec. The spec token effect starts the new load.
        refreshGenByKey.current.set(
          sliceKey,
          (refreshGenByKey.current.get(sliceKey) ?? 0) + 1,
        );
      }

      dispatch({
        type: "set-history-slice",
        workspaceId: repoPath,
        sourceKey,
        slice: request,
      });
    },
    [],
  );

  const workspaces = useMemo(
    () =>
      state.workspaceOrder.map((id) => ({
        id,
        group: state.groups[id]!,
      })),
    [state.workspaceOrder, state.groups],
  );

  return {
    ...state,
    repo: activeGroup?.repo ?? null,
    branches: activeGroup?.branches ?? [],
    baseBranch: activeRow?.baseBranch ?? "",
    headBranch: activeRow?.headBranch ?? "",
    overview: activeRow?.overview ?? null,
    fileDiffs: activeRow?.fileDiffs ?? [],
    branchLoading: activeRow?.loading ?? false,
    branchError: activeRow?.error ?? null,
    branchMetadata: activeGroup?.branchMetadata ?? [],
    metadataLoading: activeGroup?.metadataLoading ?? false,
    activeMergeBase: activeMergeBaseFromState(state),
    activeReviewStamp: activeReviewStampFromState(state),
    activeKey: state.activeKey,
    comparisons: state.comparisons,
    columnCollapsed: state.columnCollapsed,
    workspaces,
    refreshOverview,
    refreshOverviewMeta,
    openRepo,
    openRemote,
    remoteOpens,
    recoveryPaths,
    dismissRemoteOpen,
    closeRepo,
    closeWorkspace,
    closeComparison,
    activateComparison,
    spawnComparison,
    addWorkspace,
    toggleGroupCollapsed,
    setColumnCollapsed,
    handleComparisonChange,
    loadBranches,
    loadBranchMetadata,
    applyHistorySlice,
  };
}

export type RepoSessionValue = ReturnType<typeof useRepoSessionState>;
