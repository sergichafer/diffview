import { enrichInventory } from "@/features/changed-files/enrich";
import { resolveComparisonPrefs } from "@/features/settings/comparisonPrefs";
import type { AppSettings } from "@/shared/types/app";
import { makeComparisonKey, type ComparisonKey } from "@/features/branch-compare/comparisonKey";
import { mergeFileDiffs } from "./mergeFileDiffs";
import {
  emptyComparisonRow,
  emptyMultiSessionState,
  type ComparisonRow,
  type MultiSessionAction,
  type MultiSessionState,
  type WorkspaceGroup,
} from "./types";

function touchMru(keys: ComparisonKey[], key: ComparisonKey): ComparisonKey[] {
  return [key, ...keys.filter((k) => k !== key)];
}

function updateComparisonRow(
  state: MultiSessionState,
  key: ComparisonKey,
  patch: Partial<ComparisonRow>,
): MultiSessionState {
  const row = state.comparisons[key];
  if (!row) return state;
  return {
    ...state,
    comparisons: { ...state.comparisons, [key]: { ...row, ...patch } },
  };
}

function removeComparisonFromState(
  state: MultiSessionState,
  key: ComparisonKey,
): MultiSessionState {
  const row = state.comparisons[key];
  if (!row) return state;

  const group = state.groups[row.repoPath];
  const comparisons = { ...state.comparisons };
  delete comparisons[key];

  const nextGroups = group
    ? {
        ...state.groups,
        [row.repoPath]: {
          ...group,
          comparisonKeys: group.comparisonKeys.filter((k) => k !== key),
        },
      }
    : state.groups;

  const mruKeys = state.mruKeys.filter((k) => k !== key);
  let activeKey = state.activeKey === key ? null : state.activeKey;
  if (activeKey == null) {
    const sameGroup = nextGroups[row.repoPath]?.comparisonKeys[0];
    activeKey =
      sameGroup ??
      mruKeys.find((k) => k in comparisons) ??
      Object.keys(comparisons)[0] ??
      null;
  }

  return {
    ...state,
    comparisons,
    groups: nextGroups,
    activeKey,
    mruKeys,
  };
}

export function activeRowFromState(
  state: MultiSessionState,
): ComparisonRow | null {
  if (!state.activeKey) return null;
  return state.comparisons[state.activeKey] ?? null;
}

export function activeMergeBaseFromState(state: MultiSessionState): string {
  const row = activeRowFromState(state);
  return row?.mergeBaseOid ?? row?.overview?.mergeBase ?? "";
}

export function activeGroupFromState(
  state: MultiSessionState,
): WorkspaceGroup | null {
  const row = activeRowFromState(state);
  if (!row) return null;
  return state.groups[row.repoPath] ?? null;
}

export function sessionReducer(
  state: MultiSessionState,
  action: MultiSessionAction,
): MultiSessionState {
  switch (action.type) {
    case "reset":
      return { ...emptyMultiSessionState };
    case "add-workspace":
      if (state.workspaceOrder.includes(action.workspaceId)) return state;
      return {
        ...state,
        workspaceOrder: [...state.workspaceOrder, action.workspaceId],
        groups: { ...state.groups, [action.workspaceId]: action.group },
      };
    case "close-workspace": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;

      let next = state;
      for (const key of group.comparisonKeys) {
        next = removeComparisonFromState(next, key);
      }

      const groups = { ...next.groups };
      delete groups[action.workspaceId];

      return {
        ...next,
        workspaceOrder: next.workspaceOrder.filter(
          (id) => id !== action.workspaceId,
        ),
        groups,
      };
    }
    case "spawn-comparison": {
      const group = state.groups[action.workspaceId];
      if (!group || state.comparisons[action.key]) return state;
      const comparisonKeys = group.comparisonKeys.includes(action.key)
        ? group.comparisonKeys
        : [...group.comparisonKeys, action.key];
      return {
        ...state,
        comparisons: { ...state.comparisons, [action.key]: action.row },
        groups: {
          ...state.groups,
          [action.workspaceId]: { ...group, comparisonKeys },
        },
        mruKeys: touchMru(state.mruKeys, action.key),
      };
    }
    case "close-comparison":
      return removeComparisonFromState(state, action.key);
    case "activate":
      if (!state.comparisons[action.key]) return state;
      return {
        ...state,
        activeKey: action.key,
        mruKeys: touchMru(state.mruKeys, action.key),
      };
    case "set-group-collapsed": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.workspaceId]: { ...group, collapsed: action.collapsed },
        },
      };
    }
    case "set-column-collapsed":
      return { ...state, columnCollapsed: action.collapsed };
    case "comparison-loading":
      return updateComparisonRow(state, action.key, { loading: action.loading });
    case "comparison-error":
      return updateComparisonRow(state, action.key, { error: action.error });
    case "comparison-overview": {
      const row = state.comparisons[action.key];
      if (!row) return state;
      return updateComparisonRow(state, action.key, {
        overview: action.overview,
        fileDiffs: [],
        error: null,
        mergeBaseOid: action.overview.mergeBase,
        headOid: action.overview.headOid,
        isLive: action.overview.isLive,
        outdated: false,
        residency: row.residency === "cold" ? "warm" : row.residency,
      });
    }
    case "patch-overview": {
      const row = state.comparisons[action.key];
      if (!row) return state;
      return updateComparisonRow(state, action.key, {
        overview: action.overview,
        mergeBaseOid: action.overview.mergeBase,
        headOid: action.overview.headOid,
        isLive: action.overview.isLive,
        // Preserve row.outdated: meta refresh must not clear a pending full reload.
        residency: row.residency === "cold" ? "warm" : row.residency,
      });
    }
    case "append-file-diffs": {
      const row = state.comparisons[action.key];
      if (!row) return state;
      const fileDiffs = mergeFileDiffs(row.fileDiffs, action.fileDiffs);
      const overview =
        row.overview == null || action.fileDiffs.length === 0
          ? row.overview
          : {
              ...row.overview,
              files: enrichInventory(row.overview.files, action.fileDiffs),
            };
      return updateComparisonRow(state, action.key, {
        fileDiffs,
        overview,
        residency: "hot",
      });
    }
    case "mark-outdated":
      return updateComparisonRow(state, action.key, { outdated: action.outdated });
    case "demote-hot-to-warm": {
      const row = state.comparisons[action.key];
      if (!row || row.residency !== "hot") return state;
      return updateComparisonRow(state, action.key, {
        residency: "warm",
        fileDiffs: [],
      });
    }
    case "branches": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;

      const recovering =
        group.branches.length === 0 &&
        action.branches.length > 0 &&
        group.repo != null;

      if (!recovering) {
        return {
          ...state,
          groups: {
            ...state.groups,
            [action.workspaceId]: { ...group, branches: action.branches },
          },
        };
      }

      const activeRow = activeRowFromState(state);
      const hasUsablePair =
        activeRow != null &&
        activeRow.repoPath === action.workspaceId &&
        activeRow.baseBranch !== "" &&
        activeRow.headBranch !== "" &&
        action.branches.includes(activeRow.baseBranch) &&
        action.branches.includes(activeRow.headBranch);

      if (hasUsablePair) {
        return {
          ...state,
          groups: {
            ...state.groups,
            [action.workspaceId]: { ...group, branches: action.branches },
          },
        };
      }

      const { base, head } = resolveComparisonPrefs(
        action.settings,
        group.repo,
        action.branches,
      );
      const key = makeComparisonKey(action.workspaceId, base, head);
      let next = {
        ...state,
        groups: {
          ...state.groups,
          [action.workspaceId]: { ...group, branches: action.branches },
        },
      };

      if (!next.comparisons[key]) {
        next = sessionReducer(next, {
          type: "spawn-comparison",
          workspaceId: action.workspaceId,
          key,
          row: emptyComparisonRow(key, action.workspaceId, base, head),
        });
      }
      return sessionReducer(next, { type: "activate", key });
    }
    case "branch-metadata-loading": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.workspaceId]: {
            ...group,
            metadataLoading: action.loading,
          },
        },
      };
    }
    case "branch-metadata": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.workspaceId]: {
            ...group,
            branchMetadata: action.metadata,
            metadataLoading: false,
          },
        },
      };
    }
    case "update-repo": {
      const group = state.groups[action.workspaceId];
      if (!group) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.workspaceId]: { ...group, repo: action.repo },
        },
      };
    }
  }
}

export function lruHotKeyToDemote(
  state: MultiSessionState,
  excludeKey?: ComparisonKey,
): ComparisonKey | null {
  for (let i = state.mruKeys.length - 1; i >= 0; i--) {
    const key = state.mruKeys[i]!;
    if (key === excludeKey || key === state.activeKey) continue;
    const row = state.comparisons[key];
    if (row?.residency === "hot") return key;
  }
  return null;
}
