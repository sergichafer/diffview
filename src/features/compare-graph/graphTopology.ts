import type {
  BranchMetadata,
  BranchOverview,
  ChangedFile,
  FileBadge,
} from "@/shared/types/app";

export type GraphOverviewSlice = Pick<
  BranchOverview,
  "mergeBase" | "headOid" | "currentBranch" | "baseBranch"
>;

export type GraphMetadataRow = Pick<BranchMetadata, "name" | "ahead" | "behind">;

export type GraphTopologyInput = {
  head: string;
  base: string;
  overview: GraphOverviewSlice | null;
  metadata: readonly GraphMetadataRow[];
};

export type GraphTopology =
  | { kind: "unknown"; baseLabel: string }
  | { kind: "sync"; baseLabel: string }
  | { kind: "linear"; ahead: number; baseLabel: string }
  | { kind: "behind"; behind: number; baseLabel: string }
  | { kind: "diverged"; ahead: number; behind: number; baseLabel: string };

function sameCommit(overview: GraphOverviewSlice | null): boolean {
  if (!overview?.mergeBase) return false;
  return overview.mergeBase === overview.headOid;
}

/**
 * Empty or current-branch head is live working-tree mode.
 * Same rule as `resolve_comparison`: selected `head` wins over a stale
 * `overview.isLive` so the peek tracks the title-bar comparison.
 */
export function comparisonIsLive(
  overview: Pick<BranchOverview, "isLive" | "currentBranch"> | null,
  head: string,
): boolean {
  const trimmed = head.trim();
  const current = overview?.currentBranch?.trim() ?? "";
  if (!trimmed) return true;
  if (current && trimmed === current) return true;
  if (current && trimmed !== current) return false;
  return overview?.isLive ?? false;
}

const WIP_FILE_BADGES: ReadonlySet<FileBadge> = new Set([
  "staged",
  "unstaged",
  "untracked",
]);

function fileHasWipBadge(file: ChangedFile): boolean {
  return file.badges.some((badge) => WIP_FILE_BADGES.has(badge));
}

/** Uncommitted staged, unstaged, or untracked changes on a live comparison. */
export function comparisonHasWip(
  overview: Pick<BranchOverview, "isLive" | "currentBranch" | "files"> | null,
  head: string,
): boolean {
  if (!comparisonIsLive(overview, head)) return false;
  return overview?.files.some(fileHasWipBadge) ?? false;
}

export function graphTitle(topology: GraphTopology): string {
  switch (topology.kind) {
    case "unknown":
      return "Graph";
    case "sync":
      return "In sync";
    case "linear":
      return "Linear";
    case "behind":
      return "Behind";
    case "diverged":
      return "Diverged";
  }
}

export function graphDetail(topology: GraphTopology): string {
  switch (topology.kind) {
    case "unknown":
      return "Waiting for branch counts.";
    case "sync":
      return "0 ahead, 0 behind.";
    case "linear":
      return `${topology.ahead} ahead, 0 behind.`;
    case "behind":
      return `0 ahead, ${topology.behind} behind.`;
    case "diverged":
      return `${topology.ahead} ahead of ${topology.baseLabel}, ${topology.behind} behind.`;
  }
}

export function graphTopology(input: GraphTopologyInput): GraphTopology {
  const { head, base, overview, metadata } = input;
  const headName = head || overview?.currentBranch || "";
  const row = headName
    ? metadata.find((entry) => entry.name === headName)
    : undefined;
  const baseLabel = overview?.baseBranch || base;

  if (!row) {
    if (sameCommit(overview)) return { kind: "sync", baseLabel };
    return { kind: "unknown", baseLabel };
  }

  const { ahead, behind } = row;
  if (ahead > 0 && behind > 0) {
    return { kind: "diverged", ahead, behind, baseLabel };
  }
  if (ahead > 0) return { kind: "linear", ahead, baseLabel };
  if (behind > 0) return { kind: "behind", behind, baseLabel };
  return { kind: "sync", baseLabel };
}
