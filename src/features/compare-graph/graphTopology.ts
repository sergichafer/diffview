import type { BranchMetadata, BranchOverview } from "@/shared/types/app";

export const MAX_INTERMEDIATE_DOTS = 8;

export type GraphKind = "diverged" | "linear" | "behind" | "sync" | "unknown";

export type GraphOverviewSlice = Pick<
  BranchOverview,
  "isLive" | "mergeBase" | "headOid" | "currentBranch" | "baseBranch"
>;

export type GraphMetadataRow = Pick<BranchMetadata, "name" | "ahead" | "behind">;

export type GraphTopologyInput = {
  head: string;
  base: string;
  overview: GraphOverviewSlice | null;
  metadata: readonly GraphMetadataRow[];
};

export type GraphTopology = {
  kind: GraphKind;
  title: string;
  detail: string;
  ahead: number;
  behind: number;
  baseLabel: string;
  drawnAhead: number;
  drawnBehind: number;
  hasMetadata: boolean;
};

const KIND_TITLE: Record<GraphKind, string> = {
  diverged: "Diverged",
  linear: "Linear",
  behind: "Behind",
  sync: "In sync",
  unknown: "Graph",
};

export function intermediateDotCount(commitCount: number): number {
  if (commitCount <= 1) return 0;
  return Math.min(commitCount - 1, MAX_INTERMEDIATE_DOTS);
}

function kindOf(ahead: number, behind: number): GraphKind {
  if (ahead > 0 && behind > 0) return "diverged";
  if (ahead > 0) return "linear";
  if (behind > 0) return "behind";
  return "sync";
}

function kindDetail(
  kind: GraphKind,
  ahead: number,
  behind: number,
  baseLabel: string,
): string {
  switch (kind) {
    case "diverged":
      return `${ahead} ahead of ${baseLabel}, ${behind} behind.`;
    case "linear":
      return `${ahead} ahead, 0 behind.`;
    case "behind":
      return `0 ahead, ${behind} behind.`;
    case "sync":
      return "0 ahead, 0 behind.";
    case "unknown":
      return "Waiting for branch counts.";
  }
}

function sameCommit(overview: GraphOverviewSlice | null): boolean {
  if (!overview?.mergeBase) return false;
  return overview.mergeBase === overview.headOid;
}

/** Empty head is live working-tree mode; otherwise trust overview.isLive. */
export function comparisonIsLive(
  overview: Pick<BranchOverview, "isLive"> | null,
  head: string,
): boolean {
  return overview?.isLive ?? head === "";
}

export function graphTopology(input: GraphTopologyInput): GraphTopology {
  const { head, base, overview, metadata } = input;
  const headName = head || overview?.currentBranch || "";
  const row = headName
    ? metadata.find((entry) => entry.name === headName)
    : undefined;
  const hasMetadata = row != null;
  const ahead = row?.ahead ?? 0;
  const behind = row?.behind ?? 0;
  const kind = hasMetadata
    ? kindOf(ahead, behind)
    : sameCommit(overview)
      ? "sync"
      : "unknown";
  const title = KIND_TITLE[kind];
  const baseLabel = overview?.baseBranch || base;
  const detail = kindDetail(kind, ahead, behind, baseLabel);

  return {
    kind,
    title,
    detail,
    ahead,
    behind,
    baseLabel,
    drawnAhead: hasMetadata ? intermediateDotCount(ahead) : 0,
    drawnBehind: hasMetadata ? intermediateDotCount(behind) : 0,
    hasMetadata,
  };
}
