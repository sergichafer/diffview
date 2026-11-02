import type { FileDiffResult } from "@/shared/types/app";

/**
 * Last write wins by path. Streamed batches carry new paths, so the common
 * case is a plain append; only a repeated path pays for a rebuild.
 */
export function mergeFileDiffs(
  existing: readonly FileDiffResult[],
  batch: readonly FileDiffResult[],
): FileDiffResult[] {
  if (batch.length === 0) return [...existing];

  const batchPaths = new Set(batch.map((diff) => diff.path));
  const repeats =
    batchPaths.size !== batch.length ||
    existing.some((diff) => batchPaths.has(diff.path));
  if (!repeats) return existing.concat(batch);

  const byPath = new Map(existing.map((diff) => [diff.path, diff]));
  for (const diff of batch) {
    byPath.set(diff.path, diff);
  }
  return Array.from(byPath.values());
}
