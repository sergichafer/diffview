import type { HistoryLane } from "@/shared/types/app";

export const HISTORY_ROW = 52;

export type HistoryMode = "range" | "commit";

export type HistoryKind = "range" | "commit" | "base";

export type HistorySlice = {
  sourceBase: string;
  sourceHead: string;
  specBase: string;
  specHead: string;
  kind: HistoryKind;
  label: string;
  short: string;
  detail: string;
  baseLabel: string;
};

export type HistoryNode =
  | { kind: "wip"; id: "wip" }
  | {
      kind: "commit";
      id: string;
      oid: string;
      short: string;
      subject: string;
      parent?: string;
      time: number;
      tip: boolean;
    }
  | { kind: "base"; id: "base"; oid: string; label: string };

export function indexToY(index: number, row = HISTORY_ROW): number {
  return (index + 0.5) * row;
}

export function yToIndex(y: number, row = HISTORY_ROW): number {
  return y / row - 0.5;
}

export function sameHistorySpec(a: HistorySlice, b: HistorySlice): boolean {
  return a.kind === b.kind && a.specBase === b.specBase && a.specHead === b.specHead;
}

export function historySliceChip(kind: HistoryKind): string {
  switch (kind) {
    case "range":
      return "through here";
    case "commit":
      return "this commit";
    case "base":
      return "merge-base";
  }
}

export function historyModeOf(kind: HistoryKind): HistoryMode {
  return kind === "commit" ? "commit" : "range";
}

/** Empty and missing parents are the same: the commit has no parent. */
export function commitParent(parent: string | null | undefined): string | undefined {
  if (parent == null) return undefined;
  const trimmed = parent.trim();
  if (trimmed === "") return undefined;
  return trimmed;
}

export function buildHistoryNodes(
  lane: HistoryLane,
  isLive: boolean,
  baseLabel: string,
): HistoryNode[] {
  const nodes: HistoryNode[] = [];
  if (isLive) nodes.push({ kind: "wip", id: "wip" });
  lane.commits.forEach((commit, index) => {
    nodes.push({
      kind: "commit",
      id: commit.oid,
      oid: commit.oid,
      short: commit.short,
      subject: commit.subject,
      parent: commitParent(commit.parent),
      time: commit.time,
      tip: index === 0,
    });
  });
  nodes.push({
    kind: "base",
    id: "base",
    oid: lane.mergeBase,
    label: baseLabel,
  });
  return nodes;
}

export function relativeCommitTime(unixSeconds: number, nowSeconds: number): string {
  const delta = Math.max(0, nowSeconds - unixSeconds);
  if (delta < 60) return "now";
  const minutes = Math.round(delta / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(delta / 3600);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(delta / 86400);
  if (days < 14) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

function laterCommitCount(nodes: readonly HistoryNode[], index: number): number {
  return nodes.slice(0, index).filter((node) => node.kind === "commit").length;
}

function hasWip(nodes: readonly HistoryNode[]): boolean {
  return nodes.some((node) => node.kind === "wip");
}

export function historySliceTarget(args: {
  nodes: readonly HistoryNode[];
  index: number;
  mode: HistoryMode;
  sourceBase: string;
  sourceHead: string;
  headOid: string;
  mergeBase: string;
}): HistorySlice | null {
  const node = args.nodes[args.index];
  if (!node || node.kind === "wip") return null;

  if (node.kind === "base") {
    if (args.headOid === args.mergeBase) return null;
    return {
      sourceBase: args.sourceBase,
      sourceHead: args.sourceHead,
      specBase: args.sourceBase,
      specHead: node.oid,
      kind: "base",
      label: node.label,
      short: "",
      detail: "Merge-base. Nothing ahead of this point.",
      baseLabel: args.sourceBase,
    };
  }

  if (args.mode === "commit") {
    if (!node.parent) return null;
    return {
      sourceBase: args.sourceBase,
      sourceHead: args.sourceHead,
      specBase: node.parent,
      specHead: node.oid,
      kind: "commit",
      label: node.subject,
      short: node.short,
      detail: `Only ${node.short}.`,
      baseLabel: args.sourceBase,
    };
  }

  if (node.tip && !hasWip(args.nodes)) return null;

  const later = laterCommitCount(args.nodes, args.index);
  const detail = node.tip
    ? `Through ${node.short}. Uncommitted changes hidden.`
    : hasWip(args.nodes)
      ? `Through ${node.short}. ${later} later ${later === 1 ? "commit" : "commits"} and uncommitted changes hidden.`
      : `Through ${node.short}. ${later} later ${later === 1 ? "commit" : "commits"} hidden.`;

  return {
    sourceBase: args.sourceBase,
    sourceHead: args.sourceHead,
    specBase: args.sourceBase,
    specHead: node.oid,
    kind: "range",
    label: node.subject,
    short: node.short,
    detail,
    baseLabel: args.sourceBase,
  };
}

export function historyCaption(args: {
  nodes: readonly HistoryNode[];
  index: number;
  mode: HistoryMode;
  sourceBase: string;
  sourceHead: string;
  headOid: string;
  mergeBase: string;
  truncated: boolean;
}): string {
  const node = args.nodes[args.index];
  const ahead = args.nodes.filter((entry) => entry.kind === "commit").length;
  const tail = args.truncated ? " Older commits are not listed." : "";
  if (!node || node.kind === "wip") {
    return `Working tree. ${ahead} ahead, including uncommitted changes.${tail}`;
  }
  if (node.kind === "base") {
    return `Merge-base. Nothing ahead of this point.${tail}`;
  }
  const target = historySliceTarget(args);
  if (target?.kind === "commit") {
    return `This commit. ${target.label}.${tail}`;
  }
  if (args.mode === "commit" && node.kind === "commit") {
    return `This commit. ${node.subject}.${tail}`;
  }
  if (!target) return `Linear. ${ahead} ahead.${tail}`;
  return `Linear. ${target.detail}${tail}`;
}

export function historyNodeDimmed(
  _nodes: readonly HistoryNode[],
  index: number,
  selected: number,
  mode: HistoryMode,
): boolean {
  if (mode === "commit") return index !== selected;
  return index < selected;
}

export function indexForSelection(
  nodes: readonly HistoryNode[],
  selectedHead: string | null,
): number {
  if (selectedHead) {
    const match = nodes.findIndex(
      (node) =>
        (node.kind === "commit" && node.oid === selectedHead) ||
        (node.kind === "base" && node.oid === selectedHead),
    );
    if (match >= 0) return match;
  }
  const wip = nodes.findIndex((node) => node.kind === "wip");
  if (wip >= 0) return wip;
  const tip = nodes.findIndex((node) => node.kind === "commit" && node.tip);
  if (tip >= 0) return tip;
  return 0;
}
