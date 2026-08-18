import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import { normalizeChangedFilePath } from "./identity";

/**
 * Unknown paths in diffs are ignored; unmatched files keep prior flags.
 * Path match uses normalizeChangedFilePath on both sides.
 */
export function enrichInventory(
  files: readonly ChangedFile[],
  diffs: readonly FileDiffResult[],
): ChangedFile[] {
  if (diffs.length === 0) return [...files];

  const batchByPath = new Map(
    diffs.map((diff) => [normalizeChangedFilePath(diff.path), diff]),
  );
  return files.map((file) => {
    const diff = batchByPath.get(normalizeChangedFilePath(file.path));
    return diff ? { ...file, isBinary: diff.isBinary } : file;
  });
}
