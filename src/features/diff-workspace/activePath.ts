import type { CodeView } from "@pierre/diffs";
import { DEFAULT_CODE_VIEW_FILE_METRICS } from "@pierre/diffs";

/**
 * Item ids that Pierre has laid out (getTopForItem is defined).
 * Scroll-to-path must not consult ids that are only in React state yet. A missing
 * next-item top used to expand the previous item's band to contentEnd, pinning
 * the active path on an earlier file while the user scrolled further.
 */
export function laidOutDiffItemIds<T = undefined>(
  viewer: CodeView<T>,
  itemIds: readonly string[],
): string[] {
  return itemIds.filter((id) => viewer.getTopForItem(id) != null);
}

/** `tops` must be sorted ascending. Returns -1 if every top is above the headline. */
function rightmostAtOrBeforeHeadline(
  tops: readonly number[],
  headlineLine: number,
): number {
  let lo = 0;
  let hi = tops.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid]! <= headlineLine) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Same selection rule as the historical linear scan: last band where
 * itemTop <= headlineLine && itemBottom > scrollTop, else the last id.
 */
function resolveFromDenseTops(
  ids: readonly string[],
  tops: readonly number[],
  scrollTop: number,
  headlineLine: number,
  contentEnd: number,
): string | null {
  if (ids.length === 0) return null;

  const candidate = rightmostAtOrBeforeHeadline(tops, headlineLine);
  if (candidate < 0) {
    return ids[ids.length - 1] ?? null;
  }

  for (let i = candidate; i >= 0; i--) {
    const itemBottom = i + 1 < ids.length ? tops[i + 1]! : contentEnd;
    if (tops[i]! <= headlineLine && itemBottom > scrollTop) {
      return ids[i]!;
    }
  }

  return ids[ids.length - 1] ?? null;
}

/**
 * Fast path when every id has a top. Returns `undefined` if a null top is
 * encountered so the caller can fall back to the filter path.
 */
function tryResolveAssumingAllLaidOut<T>(
  viewer: CodeView<T>,
  itemIds: readonly string[],
  scrollTop: number,
  headlineLine: number,
): string | null | undefined {
  const n = itemIds.length;
  if (n === 0) return null;

  const topAt = (i: number): number | null => {
    const top = viewer.getTopForItem(itemIds[i]!);
    return top == null ? null : top;
  };

  const firstTop = topAt(0);
  if (firstTop == null) return undefined;

  // Probe the end first: during steady scroll virtually all items are laid out.
  // A trailing null means React ids extend past Pierre's layout; use filter path.
  if (n > 1) {
    const lastTop = topAt(n - 1);
    if (lastTop == null) return undefined;
  }

  const contentEnd = firstTop + viewer.getScrollHeight();

  // Binary search with getTopForItem; abort to filter path on any sparse null.
  let lo = 0;
  let hi = n - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const top = topAt(mid);
    if (top == null) return undefined;
    if (top <= headlineLine) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best < 0) {
    return itemIds[n - 1] ?? null;
  }

  let itemBottom: number;
  if (best + 1 < n) {
    const nextTop = topAt(best + 1);
    if (nextTop == null) return undefined;
    itemBottom = nextTop;
  } else {
    itemBottom = contentEnd;
  }

  if (itemBottom > scrollTop) {
    return itemIds[best]!;
  }

  for (let i = best - 1; i >= 0; i--) {
    const top = topAt(i);
    if (top == null) return undefined;
    const nextTop = topAt(i + 1);
    if (nextTop == null) return undefined;
    if (top <= headlineLine && nextTop > scrollTop) {
      return itemIds[i]!;
    }
  }

  return itemIds[n - 1] ?? null;
}

/**
 * Diff whose sticky headline is "current", using the same headline band as
 * sticky headers. Dense layout: binary search on item tops. Sparse null tops:
 * filter to laid-out ids, then binary search the dense list.
 */
export function resolveActiveDiffPathFromScroll<T = undefined>(
  viewer: CodeView<T>,
  itemIds: readonly string[],
  scrollTop: number,
  stickyHeaders = true,
): string | null {
  if (itemIds.length === 0) return null;

  const headlineLine =
    scrollTop +
    (stickyHeaders ? DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight : 0);

  const fast = tryResolveAssumingAllLaidOut(
    viewer,
    itemIds,
    scrollTop,
    headlineLine,
  );
  if (fast !== undefined) return fast;

  // Sparse nulls: only laid-out ids occupy space (see laidOutDiffItemIds).
  const ids: string[] = [];
  const tops: number[] = [];
  for (const id of itemIds) {
    const top = viewer.getTopForItem(id);
    if (top == null) continue;
    ids.push(id);
    tops.push(top);
  }
  if (ids.length === 0) return null;

  const contentEnd = tops[0]! + viewer.getScrollHeight();
  return resolveFromDenseTops(ids, tops, scrollTop, headlineLine, contentEnd);
}
