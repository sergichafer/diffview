import type {
  GetLineIndexUtility,
  SelectedLineRange,
} from "@pierre/diffs";

export const COMMENT_LINE_ATTR = "data-comment-line";

export type CommentColumn = "unified" | "additions" | "deletions";

const COLUMN_SELECTOR: Record<CommentColumn, string> = {
  unified: "[data-code]:not([data-deletions]):not([data-additions])",
  additions: "[data-additions]",
  deletions: "[data-deletions]",
};

function addRowRange(
  occupied: Map<CommentColumn, Set<number>>,
  column: CommentColumn,
  start: number,
  end: number,
): void {
  let rows = occupied.get(column);
  if (rows == null) {
    rows = new Set();
    occupied.set(column, rows);
  }
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let index = lo; index <= hi; index++) rows.add(index);
}

/** Row indices to paint for each comment range, using Pierre's line-index space. */
export function occupyCommentRows(
  ranges: readonly SelectedLineRange[],
  split: boolean,
  getLineIndex: GetLineIndexUtility,
): Map<CommentColumn, Set<number>> {
  const occupied = new Map<CommentColumn, Set<number>>();
  for (const range of ranges) {
    const startSide = range.side;
    if (startSide == null) continue;
    const endSide = range.endSide ?? startSide;
    const startIndexes = getLineIndex(range.start, startSide);
    const endIndexes = getLineIndex(range.end, endSide);
    if (startIndexes == null || endIndexes == null) continue;
    if (!split) {
      addRowRange(occupied, "unified", startIndexes[0], endIndexes[0]);
      continue;
    }
    if (startSide === endSide) {
      addRowRange(occupied, startSide, startIndexes[1], endIndexes[1]);
      continue;
    }
    addRowRange(occupied, startSide, startIndexes[1], startIndexes[1]);
    addRowRange(occupied, endSide, endIndexes[1], endIndexes[1]);
  }
  return occupied;
}

function parseLineIndex(element: Element, split: boolean): number | undefined {
  const lineIndexes = (element.getAttribute("data-line-index") ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value));
  if (split && lineIndexes.length === 2) return lineIndexes[1];
  if (!split) return lineIndexes[0];
  return undefined;
}

function highlightRoot(node: HTMLElement): ParentNode {
  return node.shadowRoot ?? node;
}

function clearCommentLines(root: ParentNode): void {
  for (const element of root.querySelectorAll(`[${COMMENT_LINE_ATTR}]`)) {
    element.removeAttribute(COMMENT_LINE_ATTR);
  }
}

function markCommentLine(element: Element): void {
  element.setAttribute(COMMENT_LINE_ATTR, "");
}

function isPairedSlot(element: Element): boolean {
  return (
    element.hasAttribute("data-line-annotation") ||
    element.hasAttribute("data-merge-conflict-actions") ||
    element.hasAttribute("data-gutter-buffer")
  );
}

/**
 * Stamp occupied Pierre rows with `data-comment-line` so comment ranges sit in
 * the same gutter and code slots without using `selectedLines`.
 */
export function paintCommentLines(
  node: HTMLElement,
  getLineIndex: GetLineIndexUtility,
  ranges: readonly SelectedLineRange[],
): void {
  const root = highlightRoot(node);
  clearCommentLines(root);
  if (ranges.length === 0) return;
  const pre = root.querySelector("pre");
  if (!(pre instanceof HTMLElement)) return;
  const split = pre.getAttribute("data-diff-type") === "split";
  const occupied = occupyCommentRows(ranges, split, getLineIndex);

  for (const [column, rows] of occupied) {
    const code = pre.querySelector(COLUMN_SELECTOR[column]);
    if (code == null) continue;
    for (const element of code.querySelectorAll("[data-line-index]")) {
      const lineIndex = parseLineIndex(element, split);
      if (lineIndex == null || !rows.has(lineIndex)) continue;
      markCommentLine(element);
      const next = element.nextElementSibling;
      if (next != null && isPairedSlot(next)) markCommentLine(next);
    }
  }
}
