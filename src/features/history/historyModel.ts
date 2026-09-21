import type { HistoryLane } from "@/shared/types/app";

export const HISTORY_ROW = 52;

export type HistoryMode = "range" | "commit";

export type HistoryNode =
  | { kind: "wip"; id: "wip" }
  | {
      kind: "commit";
      id: string;
      oid: string;
      short: string;
      subject: string;
      parent: string;
      time: number;
      tip: boolean;
    }
  | { kind: "base"; id: "base"; oid: string; label: string };

export type HistorySliceTarget = {
  mode: HistoryMode;
  baseBranch: string;
  headBranch: string;
  label: string;
  short: string;
  detail: string;
  historyBaseLabel: string;
  historyMark: string;
};

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
      parent: commit.parent,
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
  baseBranch: string;
  headOid: string;
  mergeBase: string;
}): HistorySliceTarget | null {
  const node = args.nodes[args.index];
  if (!node || node.kind === "wip") return null;

  if (node.kind === "base") {
    if (args.headOid === args.mergeBase) return null;
    return {
      mode: "range",
      baseBranch: args.baseBranch,
      headBranch: node.oid,
      label: node.label,
      short: "",
      detail: "Merge-base. Nothing ahead of this point.",
      historyBaseLabel: args.baseBranch,
      historyMark: "merge-base",
    };
  }

  if (node.tip && args.mode === "range" && !hasWip(args.nodes)) return null;

  if (args.mode === "commit" && node.parent) {
    return {
      mode: "commit",
      baseBranch: node.parent,
      headBranch: node.oid,
      label: node.subject,
      short: node.short,
      detail: `Only ${node.short}.`,
      historyBaseLabel: args.baseBranch,
      historyMark: "this commit",
    };
  }

  const later = laterCommitCount(args.nodes, args.index);
  const detail = node.tip
    ? `Through ${node.short}. Uncommitted changes hidden.`
    : hasWip(args.nodes)
      ? `Through ${node.short}. ${later} later ${later === 1 ? "commit" : "commits"} and uncommitted changes hidden.`
      : `Through ${node.short}. ${later} later ${later === 1 ? "commit" : "commits"} hidden.`;

  return {
    mode: "range",
    baseBranch: args.baseBranch,
    headBranch: node.oid,
    label: node.subject,
    short: node.short,
    detail,
    historyBaseLabel: args.baseBranch,
    historyMark: "through here",
  };
}

export function historyCaption(args: {
  nodes: readonly HistoryNode[];
  index: number;
  mode: HistoryMode;
  baseBranch: string;
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
  if (args.mode === "commit" && node.parent) {
    return `This commit. ${node.subject}.${tail}`;
  }
  const target = historySliceTarget(args);
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
