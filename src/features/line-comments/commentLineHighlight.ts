import type {
  GetLineIndexUtility,
  SelectedLineRange,
} from "@pierre/diffs";

export const COMMENT_LINE_ATTR = "data-comment-line";

export type CommentColumn = "unified" | "additions" | "deletions";

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

function paintAnnotationSlot(
  contentElement: HTMLElement,
  gutterElement: HTMLElement,
): void {
  const contentNext = contentElement.nextElementSibling;
  const gutterNext = gutterElement.nextElementSibling;
  if (
    !(contentNext instanceof HTMLElement) ||
    !(gutterNext instanceof HTMLElement)
  ) {
    return;
  }
  if (
    !contentNext.hasAttribute("data-line-annotation") &&
    !contentNext.hasAttribute("data-merge-conflict-actions")
  ) {
    return;
  }
  markCommentLine(contentNext);
  markCommentLine(gutterNext);
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
  if (occupied.size === 0) return;

  for (const code of pre.children) {
    if (!(code instanceof HTMLElement)) continue;
    const [gutter, content] = code.children;
    if (!(gutter instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      continue;
    }
    const column: CommentColumn = code.hasAttribute("data-deletions")
      ? "deletions"
      : code.hasAttribute("data-additions")
        ? "additions"
        : "unified";
    const rows = occupied.get(column);
    if (rows == null || rows.size === 0) continue;
    const len = content.children.length;
    for (let i = 0; i < len; i++) {
      const contentElement = content.children[i];
      const gutterElement = gutter.children[i];
      if (
        !(contentElement instanceof HTMLElement) ||
        !(gutterElement instanceof HTMLElement)
      ) {
        continue;
      }
      const lineIndex = parseLineIndex(contentElement, split);
      if (lineIndex == null || !rows.has(lineIndex)) continue;
      markCommentLine(gutterElement);
      markCommentLine(contentElement);
      paintAnnotationSlot(contentElement, gutterElement);
    }
  }
}
