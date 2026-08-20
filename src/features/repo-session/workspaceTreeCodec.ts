import type { AppSettings, OpenRepoResult } from "@/shared/types/app";
import type { WorkspaceTree } from "@/shared/types/generated/types";
import { resolveComparisonPrefs } from "@/features/settings/comparisonPrefs";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import {
  emptyComparisonRow,
  emptyMultiSessionState,
  type MultiSessionState,
  type WorkspaceGroup,
} from "./types";

function normalizeTree(tree: WorkspaceTree | undefined): WorkspaceTree {
  return {
    workspaces: Array.isArray(tree?.workspaces) ? tree!.workspaces : [],
    activeComparisonKey: tree?.activeComparisonKey,
    columnCollapsed: tree?.columnCollapsed ?? false,
  };
}

export function stateToWorkspaceTree(state: {
  workspaceOrder: string[];
  groups: Record<
    string,
    {
      collapsed: boolean;
      comparisonKeys: string[];
    }
  >;
  comparisons: Record<
    string,
    { baseBranch: string; headBranch: string }
  >;
  activeKey: string | null;
  columnCollapsed: boolean;
}) {
  return {
    workspaces: state.workspaceOrder.map((repoPath) => {
      const group = state.groups[repoPath];
      return {
        repoPath,
        collapsed: group?.collapsed ?? false,
        comparisons: (group?.comparisonKeys ?? []).map((key) => {
          const row = state.comparisons[key];
          return {
            baseBranch: row?.baseBranch ?? "",
            headBranch: row?.headBranch ?? "",
          };
        }),
      };
    }),
    activeComparisonKey: state.activeKey ?? undefined,
    columnCollapsed: state.columnCollapsed,
  };
}

/** Restored rows are cold. */
export function stateFromWorkspaceTree(
  tree: WorkspaceTree | undefined,
  openedByPath: Map<string, OpenRepoResult>,
): MultiSessionState {
  const normalized = normalizeTree(tree);
  if (normalized.workspaces.length === 0) {
    return { ...emptyMultiSessionState };
  }

  const workspaceOrder: string[] = [];
  const groups: Record<string, WorkspaceGroup> = {};
  const comparisons: MultiSessionState["comparisons"] = {};
  const mruKeys: string[] = [];

  for (const ws of normalized.workspaces) {
    if (typeof ws.repoPath !== "string" || ws.repoPath === "") continue;
    const opened = openedByPath.get(ws.repoPath);
    if (!opened) continue;

    const comparisonKeys: string[] = [];
    const comps = Array.isArray(ws.comparisons) ? ws.comparisons : [];
    for (const comp of comps) {
      if (
        typeof comp.baseBranch !== "string" ||
        typeof comp.headBranch !== "string"
      ) {
        continue;
      }
      const key = makeComparisonKey(
        ws.repoPath,
        comp.baseBranch,
        comp.headBranch,
      );
      if (comparisons[key]) continue;
      comparisons[key] = emptyComparisonRow(
        key,
        ws.repoPath,
        comp.baseBranch,
        comp.headBranch,
      );
      comparisonKeys.push(key);
      mruKeys.push(key);
    }

    if (comparisonKeys.length === 0) continue;

    workspaceOrder.push(ws.repoPath);
    groups[ws.repoPath] = {
      repo: opened.repo,
      branches: opened.branches,
      collapsed: ws.collapsed ?? false,
      comparisonKeys,
      branchMetadata: [],
      metadataLoading: false,
    };
  }

  if (workspaceOrder.length === 0) {
    return { ...emptyMultiSessionState };
  }

  let activeKey = normalized.activeComparisonKey ?? null;
  if (activeKey == null || !comparisons[activeKey]) {
    activeKey = groups[workspaceOrder[0]!]!.comparisonKeys[0] ?? null;
  }

  const orderedMru =
    activeKey != null
      ? [activeKey, ...mruKeys.filter((k) => k !== activeKey)]
      : mruKeys;

  return {
    workspaceOrder,
    groups,
    comparisons,
    activeKey,
    columnCollapsed: normalized.columnCollapsed,
    mruKeys: orderedMru,
  };
}

export function mergeOpenedIntoTree(
  state: MultiSessionState,
  opened: OpenRepoResult,
  settings: AppSettings,
): MultiSessionState {
  if (state.workspaceOrder.includes(opened.repo.path)) {
    const group = state.groups[opened.repo.path];
    if (!group) return state;
    return {
      ...state,
      groups: {
        ...state.groups,
        [opened.repo.path]: {
          ...group,
          repo: opened.repo,
          branches: opened.branches,
        },
      },
    };
  }

  // Bootstrap/CLI repo missing from the persisted tree: append it and make
  // it active. Never discard the restored tree.
  const { base, head } = resolveComparisonPrefs(
    settings,
    opened.repo,
    opened.branches,
  );
  const key = makeComparisonKey(opened.repo.path, base, head);
  const row = emptyComparisonRow(key, opened.repo.path, base, head);
  const group: WorkspaceGroup = {
    repo: opened.repo,
    branches: opened.branches,
    collapsed: false,
    comparisonKeys: [key],
    branchMetadata: [],
    metadataLoading: false,
  };
  return {
    ...state,
    workspaceOrder: [...state.workspaceOrder, opened.repo.path],
    groups: { ...state.groups, [opened.repo.path]: group },
    comparisons: { ...state.comparisons, [key]: row },
    activeKey: key,
    mruKeys: [key, ...state.mruKeys],
  };
}

function activateWorkspace(
  state: MultiSessionState,
  repoPath: string,
): MultiSessionState {
  const group = state.groups[repoPath];
  if (!group || group.comparisonKeys.length === 0) return state;
  if (
    state.activeKey != null &&
    group.comparisonKeys.includes(state.activeKey)
  ) {
    return state;
  }
  const inGroup = new Set(group.comparisonKeys);
  const key =
    state.mruKeys.find((k) => inGroup.has(k)) ?? group.comparisonKeys[0];
  if (key == null) return state;
  return {
    ...state,
    activeKey: key,
    mruKeys: [key, ...state.mruKeys.filter((k) => k !== key)],
  };
}

function persistedRepoPaths(tree: WorkspaceTree | undefined): Set<string> {
  const paths = new Set<string>();
  for (const ws of tree?.workspaces ?? []) {
    if (typeof ws.repoPath === "string" && ws.repoPath !== "") {
      paths.add(ws.repoPath);
    }
  }
  return paths;
}

function withMruHead(
  state: MultiSessionState,
  headKeys: string[],
): MultiSessionState {
  const preferred = state.activeKey;
  const head = new Set(headKeys);
  const ordered = [
    ...(preferred != null ? [preferred] : []),
    ...headKeys.filter((k) => k !== preferred),
    ...state.mruKeys.filter((k) => k !== preferred && !head.has(k)),
  ];
  return { ...state, mruKeys: ordered };
}

function mergeOpenedList(
  state: MultiSessionState,
  openedWorkspaces: OpenRepoResult[],
  opened: OpenRepoResult | null,
  settings: AppSettings,
  openedFromCli: boolean,
): { state: MultiSessionState; appendedKeys: string[] } {
  // Restore already decided membership for every path listed in the
  // persisted tree, including groups skipped for empty comparisons.
  const listed = persistedRepoPaths(settings.workspaceTree);
  let next = state;
  const seen = new Set<string>();
  const appendedKeys: string[] = [];

  const tryAppend = (result: OpenRepoResult) => {
    if (
      seen.has(result.repo.path) ||
      next.workspaceOrder.includes(result.repo.path)
    ) {
      return;
    }
    seen.add(result.repo.path);
    const before = next.workspaceOrder.length;
    next = mergeOpenedIntoTree(next, result, settings);
    if (next.workspaceOrder.length > before) {
      const path = next.workspaceOrder[next.workspaceOrder.length - 1]!;
      const key = next.groups[path]?.comparisonKeys[0];
      if (key) appendedKeys.push(key);
    }
  };

  for (const extra of openedWorkspaces) {
    if (listed.has(extra.repo.path)) continue;
    tryAppend(extra);
  }
  if (opened && !next.workspaceOrder.includes(opened.repo.path)) {
    if (openedFromCli || !listed.has(opened.repo.path)) {
      tryAppend(opened);
    }
  }
  return { state: next, appendedKeys };
}

export function buildInitialState(
  opened: OpenRepoResult | null,
  openedWorkspaces: OpenRepoResult[],
  settings: AppSettings,
  openedFromCli = false,
): MultiSessionState {
  const tree = settings.workspaceTree;
  let base: MultiSessionState = {
    ...emptyMultiSessionState,
    columnCollapsed: tree?.columnCollapsed ?? false,
  };
  if (tree?.workspaces?.length) {
    const openedMap = new Map<string, OpenRepoResult>(
      openedWorkspaces.map((o) => [o.repo.path, o]),
    );
    if (opened) openedMap.set(opened.repo.path, opened);
    const fromTree = stateFromWorkspaceTree(tree, openedMap);
    if (fromTree.workspaceOrder.length > 0) {
      base = fromTree;
    }
  }

  const { state: merged, appendedKeys } = mergeOpenedList(
    base,
    openedWorkspaces,
    opened,
    settings,
    openedFromCli,
  );
  let next = merged;
  if (openedFromCli && opened) {
    next = activateWorkspace(next, opened.repo.path);
    if (appendedKeys.length > 0) {
      next = withMruHead(next, appendedKeys);
    }
  }
  return next;
}
