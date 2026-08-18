import type { FileDiffResult } from "@/shared/types/app";

/** Last write wins by path. */
export function mergeFileDiffs(
  existing: readonly FileDiffResult[],
  batch: readonly FileDiffResult[],
): FileDiffResult[] {
  if (batch.length === 0) return [...existing];

  const byPath = new Map(existing.map((diff) => [diff.path, diff]));
  for (const diff of batch) {
    byPath.set(diff.path, diff);
  }
  return Array.from(byPath.values());
}
