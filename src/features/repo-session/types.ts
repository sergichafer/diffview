import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type {
  AppSettings,
  BranchMetadata,
  BranchOverview,
  FileDiffResult,
  RepoInfo,
} from "@/shared/types/app";

export type WorkspaceId = string;

export type Residency = "cold" | "warm" | "hot";

export type ComparisonRow = {
  key: ComparisonKey;
  repoPath: string;
  baseBranch: string;
  headBranch: string;
  residency: Residency;
  overview: BranchOverview | null;
  fileDiffs: FileDiffResult[];
  loading: boolean;
  error: string | null;
  mergeBaseOid: string;
  headOid: string;
  isLive: boolean;
  outdated: boolean;
};

export type WorkspaceGroup = {
  repo: RepoInfo;
  branches: string[];
  collapsed: boolean;
  comparisonKeys: ComparisonKey[];
  branchMetadata: BranchMetadata[];
  metadataLoading: boolean;
};

export type MultiSessionState = {
  workspaceOrder: WorkspaceId[];
  groups: Record<WorkspaceId, WorkspaceGroup>;
  comparisons: Record<ComparisonKey, ComparisonRow>;
  activeKey: ComparisonKey | null;
  columnCollapsed: boolean;
  mruKeys: ComparisonKey[];
};

export type MultiSessionAction =
  | { type: "reset" }
  | { type: "add-workspace"; workspaceId: WorkspaceId; group: WorkspaceGroup }
  | { type: "close-workspace"; workspaceId: WorkspaceId }
  | {
      type: "spawn-comparison";
      workspaceId: WorkspaceId;
      key: ComparisonKey;
      row: ComparisonRow;
    }
  | { type: "close-comparison"; key: ComparisonKey }
  | { type: "activate"; key: ComparisonKey }
  | { type: "set-group-collapsed"; workspaceId: WorkspaceId; collapsed: boolean }
  | { type: "set-column-collapsed"; collapsed: boolean }
  | { type: "comparison-loading"; key: ComparisonKey; loading: boolean }
  | { type: "comparison-error"; key: ComparisonKey; error: string | null }
  | { type: "comparison-overview"; key: ComparisonKey; overview: BranchOverview }
  /** Update overview (badges) without clearing fileDiffs; used after a working-tree save. */
  | { type: "patch-overview"; key: ComparisonKey; overview: BranchOverview }
  | { type: "append-file-diffs"; key: ComparisonKey; fileDiffs: FileDiffResult[] }
  | { type: "mark-outdated"; key: ComparisonKey; outdated: boolean }
  | { type: "demote-hot-to-warm"; key: ComparisonKey }
  | {
      type: "branches";
      workspaceId: WorkspaceId;
      branches: string[];
      settings: AppSettings;
    }
  | { type: "branch-metadata-loading"; workspaceId: WorkspaceId; loading: boolean }
  | { type: "branch-metadata"; workspaceId: WorkspaceId; metadata: BranchMetadata[] }
  | { type: "update-repo"; workspaceId: WorkspaceId; repo: RepoInfo };

export const emptyMultiSessionState: MultiSessionState = {
  workspaceOrder: [],
  groups: {},
  comparisons: {},
  activeKey: null,
  columnCollapsed: false,
  mruKeys: [],
};

export function emptyComparisonRow(
  key: ComparisonKey,
  repoPath: string,
  baseBranch: string,
  headBranch: string,
): ComparisonRow {
  return {
    key,
    repoPath,
    baseBranch,
    headBranch,
    residency: "cold",
    overview: null,
    fileDiffs: [],
    loading: false,
    error: null,
    mergeBaseOid: "",
    headOid: "",
    isLive: false,
    outdated: false,
  };
}
