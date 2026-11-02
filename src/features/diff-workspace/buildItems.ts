import { processFile } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs/react";
import { normalizeChangedFilePath } from "@/features/changed-files/identity";
import { orderedPaths } from "@/features/changed-files/order";
import type { CommentMeta } from "@/features/line-comments/commentMeta";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function diffCacheKey(
  path: string,
  patch: string,
  mergeBase = "",
  headOid = "",
): string {
  return `${path}:${mergeBase}:${headOid}:${hashString(patch)}`;
}

const itemCache = new Map<string, CodeViewDiffItem<CommentMeta>>();

/** @internal Test-only cache reset. */
export function clearItemCacheForTests(): void {
  itemCache.clear();
}

function isRenderableGitPatch(patch: string): boolean {
  const text = patch.trim();
  if (!text) return false;
  if (/^diff --git /m.test(text)) return true;
  if (/^--- /m.test(text) || /^\+\+\+ /m.test(text)) return true;
  if (/^@@ /m.test(text)) return true;
  return text.split("\n").some((line) => {
    if (!line) return false;
    const c = line[0];
    return c === "+" || c === "-" || c === " " || c === "\\";
  });
}

function patchForResult(result: FileDiffResult): string | null {
  const path = normalizeChangedFilePath(result.path);
  if (result.patch.trim() && isRenderableGitPatch(result.patch)) {
    return result.patch;
  }
  if (result.isBinary || result.patch.trim()) {
    const old = result.oldPath ? normalizeChangedFilePath(result.oldPath) : path;
    return `diff --git a/${old} b/${path}\nBinary files a/${old} and b/${path} differ\n`;
  }
  return null;
}

function isEditableResult(
  result: FileDiffResult,
  fileDiff: { type?: string },
): boolean {
  return !result.isBinary && fileDiff.type !== "deleted";
}

function buildItemFromResult(
  result: FileDiffResult,
  mergeBase: string,
  headOid: string,
): { item: CodeViewDiffItem<CommentMeta>; editable: boolean } | null {
  const path = normalizeChangedFilePath(result.path);
  const patch = patchForResult(result);
  if (!patch) return null;

  const cacheKey = diffCacheKey(path, patch, mergeBase, headOid);
  const cached = itemCache.get(cacheKey);
  if (cached) {
    return {
      item: cached,
      editable: isEditableResult(result, cached.fileDiff),
    };
  }

  const fileDiff = processFile(patch, {
    isGitDiff: true,
    throwOnError: false,
    cacheKey,
  });
  if (!fileDiff) return null;

  fileDiff.name = path;
  fileDiff.cacheKey = cacheKey;
  if (result.oldPath) {
    fileDiff.prevName = normalizeChangedFilePath(result.oldPath);
  }

  const editable = isEditableResult(result, fileDiff);
  // Edit attaches lazily on user intent (`editEnabledPaths`); keep items read-only
  // until then so pure scrolling creates zero editors / loadDiffFiles calls.
  const item: CodeViewDiffItem<CommentMeta> = {
    id: path,
    type: "diff",
    fileDiff,
    edit: false,
  };
  itemCache.set(cacheKey, item);
  return { item, editable };
}

function pruneItemCache(items: readonly CodeViewDiffItem<CommentMeta>[]): void {
  const activeKeys = new Set<string>();
  for (const item of items) {
    if (item.type === "diff" && item.fileDiff.cacheKey != null) {
      activeKeys.add(item.fileDiff.cacheKey);
    }
  }
  for (const key of itemCache.keys()) {
    if (!activeKeys.has(key)) {
      itemCache.delete(key);
    }
  }
}

/** Position of each path in tree order; paths the tree drops are absent. */
export function pathRanks(files: readonly ChangedFile[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const path of orderedPaths(files.map((f) => f.path))) {
    if (!ranks.has(path)) ranks.set(path, ranks.size);
  }
  return ranks;
}

/** First index in `items` (sorted by rank) whose rank is at least `rank`. */
function lowerBound(
  items: readonly CodeViewDiffItem<CommentMeta>[],
  ranks: ReadonlyMap<string, number>,
  rank: number,
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ranks.get(items[mid]!.id)! < rank) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface BuildCodeViewItemsResult {
  items: CodeViewDiffItem<CommentMeta>[];
  /** Paths that may enter edit mode (text diffs with a new side). */
  editablePaths: Set<string>;
}

export function buildCodeViewItems(
  results: FileDiffResult[],
  files: ChangedFile[],
  mergeBase = "",
  headOid = "",
): BuildCodeViewItemsResult {
  const resultByPath = new Map<string, FileDiffResult>();
  for (const result of results) {
    resultByPath.set(normalizeChangedFilePath(result.path), result);
  }

  const items: CodeViewDiffItem<CommentMeta>[] = [];
  const editablePaths = new Set<string>();

  for (const path of orderedPaths(files.map((f) => f.path))) {
    const result = resultByPath.get(path);
    if (result == null) continue;

    const built = buildItemFromResult(result, mergeBase, headOid);
    if (built == null) continue;
    items.push(built.item);
    if (built.editable) editablePaths.add(built.item.id);
  }

  pruneItemCache(items);
  return { items, editablePaths };
}

/**
 * Inserts a streamed batch into items already in tree order. Cost is one
 * linear merge plus a binary search per new result; the file list is not
 * re-sorted. `ranks` must come from `pathRanks` for the same file list.
 */
export function appendCodeViewItems(
  existingItems: readonly CodeViewDiffItem<CommentMeta>[],
  existingEditablePaths: ReadonlySet<string>,
  newResults: readonly FileDiffResult[],
  ranks: ReadonlyMap<string, number>,
  mergeBase = "",
  headOid = "",
): {
  items: CodeViewDiffItem<CommentMeta>[];
  added: CodeViewDiffItem<CommentMeta>[];
  editablePaths: Set<string>;
} {
  const editablePaths = new Set(existingEditablePaths);
  const added: CodeViewDiffItem<CommentMeta>[] = [];
  const fresh: { rank: number; item: CodeViewDiffItem<CommentMeta> }[] = [];
  const freshRanks = new Set<number>();

  for (const result of newResults) {
    const path = normalizeChangedFilePath(result.path);
    const rank = ranks.get(path);
    if (rank == null || freshRanks.has(rank)) continue;
    const at = lowerBound(existingItems, ranks, rank);
    if (at < existingItems.length && existingItems[at]!.id === path) continue;

    const built = buildItemFromResult(result, mergeBase, headOid);
    if (built == null) continue;

    freshRanks.add(rank);
    fresh.push({ rank, item: built.item });
    added.push(built.item);
    if (built.editable) editablePaths.add(built.item.id);
  }

  if (added.length === 0) {
    return { items: [...existingItems], added: [], editablePaths };
  }

  fresh.sort((a, b) => a.rank - b.rank);
  const items: CodeViewDiffItem<CommentMeta>[] = [];
  let next = 0;
  for (const item of existingItems) {
    const rank = ranks.get(item.id)!;
    while (next < fresh.length && fresh[next]!.rank < rank) {
      items.push(fresh[next]!.item);
      next += 1;
    }
    items.push(item);
  }
  for (; next < fresh.length; next += 1) items.push(fresh[next]!.item);
  return { items, added, editablePaths };
}
