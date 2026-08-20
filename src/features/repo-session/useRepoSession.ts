import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
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
import type { AppSettings, OpenRepoResult } from "@/shared/types/app";
import { makeComparisonKey, type ComparisonKey } from "@/features/branch-compare/comparisonKey";
import {
  CONCURRENT_LOAD_CAP,
  HOT_CAP,
  idleCallback,
  stampsMatch,
} from "./sessionHelpers";
import {
  activeGroupFromState,
  activeMergeBaseFromState,
  activeRowFromState,
  lruHotKeyToDemote,
  sessionReducer,
} from "./sessionReducer";
import {
  decideAfterStamp,
  decideBeforeStamp,
  type StalenessInput,
} from "./staleness";
import {
  emptyComparisonRow,
  type ComparisonRow,
  type Residency,
  type WorkspaceGroup,
} from "./types";
import {
  buildInitialState,
  stateToWorkspaceTree,
} from "./workspaceTreeCodec";

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
  };
}

export function useRepoSessionState(
  settings: AppSettings,
  update: (patch: Partial<AppSettings>) => Promise<void>,
  opened: OpenRepoResult | null = null,
  openedWorkspaces: OpenRepoResult[] = [],
  openedFromCli = false,
) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    { opened, openedWorkspaces, settings, openedFromCli },
    (init) =>
      buildInitialState(
        init.opened,
        init.openedWorkspaces,
        init.settings,
        init.openedFromCli,
      ),
  );

  const refreshGenByKey = useRef(new Map<ComparisonKey, number>());
  const inFlightLoads = useRef(0);
  const metadataInFlight = useRef(new Set<string>());
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
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
        const { baseBranch: base, headBranch: head, repoPath } = row;
        const overview = await api.getBranchOverview(repoPath, base, head);
        if (isStale()) return;

        dispatch({ type: "comparison-overview", key, overview });

        if (target === "hot") {
          const paths = orderedPaths(overview.files.map((f) => f.path));
          await loadAllFileDiffs({
            paths,
            batchSize: FILE_DIFF_BATCH_SIZE,
            concurrency: FILE_DIFF_BATCH_CONCURRENCY,
            fetchBatch: (batchPaths) =>
              api.getBranchFileDiffs(repoPath, base, head, batchPaths),
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
      try {
        const stamp = await api.getComparisonStamp(
          row.repoPath,
          row.baseBranch,
          row.headBranch,
        );
        const current = stateRef.current.comparisons[key];
        if (!current) return;
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
        await loadComparison(key, "hot");
      }
    },
    [loadComparison],
  );

  const refreshOverview = useCallback(
    async (key?: ComparisonKey) => {
      const targetKey = key ?? stateRef.current.activeKey;
      if (!targetKey) return;
      dispatch({ type: "mark-outdated", key: targetKey, outdated: true });
      await loadComparison(targetKey, "hot");
    },
    [loadComparison],
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
      const overview = await api.getBranchOverview(
        row.repoPath,
        row.baseBranch,
        row.headBranch,
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
    const tree = stateToWorkspaceTree(state);
    const json = JSON.stringify(tree);
    if (json === persistedTreeJson.current) return;
    persistedTreeJson.current = json;
    void update({ workspaceTree: tree });
  }, [state, update]);

  useEffect(() => {
    const key = state.activeKey;
    if (!key) return;
    void ensureLoaded(key);
  }, [state.activeKey, ensureLoaded]);

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
        void api
          .getComparisonStamp(row.repoPath, row.baseBranch, row.headBranch)
          .then((stamp) => {
            const latest = stateRef.current.comparisons[row.key];
            if (!latest || latest.isLive) return;
            if (!stampsMatch(latest, stamp)) {
              dispatch({ type: "mark-outdated", key: row.key, outdated: true });
            }
          })
          .catch((e) => console.error("focus stamp check failed:", e));
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const openRepo = useCallback(
    async (path: string) => {
      const { repo: info, branches } = await api.openRepository(path);
      // Canonical identity: RepoInfo.path is the backend map key. The picker
      // path is only a discovery hint; never use it as a workspace/row key
      // (it can differ, e.g. trailing slash, subdirectory of the workdir).
      const workspaceId = info.path;
      const { base, head } = resolveComparisonPrefs(settings, info, branches);
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
        dispatch({ type: "add-workspace", workspaceId, group });
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
      // patch because `update` merges.
      await update({ recentRepos: pushRecent(settings, workspaceId).recentRepos });
      void ensureLoaded(key);
    },
    [settings, update, ensureLoaded],
  );

  const closeWorkspace = useCallback(async (workspaceId: string) => {
    const keys = stateRef.current.groups[workspaceId]?.comparisonKeys ?? [];
    for (const key of keys) {
      refreshGenByKey.current.set(key, (refreshGenByKey.current.get(key) ?? 0) + 1);
    }
    await api.closeRepository(workspaceId);
    dispatch({ type: "close-workspace", workspaceId });
  }, []);

  const closeComparison = useCallback((key: ComparisonKey) => {
    refreshGenByKey.current.set(
      key,
      (refreshGenByKey.current.get(key) ?? 0) + 1,
    );
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
            settings,
          });
        } catch (e) {
          console.error("activateComparison open failed:", e);
        }
        void ensureLoaded(key);
      })();
    },
    [ensureLoaded, settings],
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
        settings,
      });
    } catch (e) {
      console.error("loadBranches failed:", e);
    }
  }, [settings]);

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
    activeKey: state.activeKey,
    comparisons: state.comparisons,
    columnCollapsed: state.columnCollapsed,
    workspaces,
    refreshOverview,
    refreshOverviewMeta,
    openRepo,
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
  };
}

export type RepoSessionValue = ReturnType<typeof useRepoSessionState>;
