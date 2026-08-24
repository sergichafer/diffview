export const MAX_INTERMEDIATE_DOTS = 8;

export type GraphKind = "diverged" | "linear" | "behind" | "sync";

export type GraphOverviewSlice = {
  isLive: boolean;
  mergeBase: string;
  headOid: string;
  currentBranch: string;
  baseBranch: string;
};

export type GraphMetadataRow = {
  name: string;
  ahead: number;
  behind: number;
};

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
  caption: string;
  ahead: number;
  behind: number;
  isLive: boolean;
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
  }
}

export function graphTopology(input: GraphTopologyInput): GraphTopology {
  const { head, base, overview, metadata } = input;
  const headName = head || overview?.currentBranch || "";
  const row = headName
    ? metadata.find((entry) => entry.name === headName)
    : undefined;
  const ahead = row?.ahead ?? 0;
  const behind = row?.behind ?? 0;
  const kind = kindOf(ahead, behind);
  const title = KIND_TITLE[kind];
  const baseLabel = overview?.baseBranch || base;
  const detail = kindDetail(kind, ahead, behind, baseLabel);

  return {
    kind,
    title,
    detail,
    caption: `${title}. ${detail}`,
    ahead,
    behind,
    isLive: overview?.isLive ?? head === "",
    baseLabel,
    drawnAhead: intermediateDotCount(ahead),
    drawnBehind: intermediateDotCount(behind),
    hasMetadata: row != null,
  };
}
