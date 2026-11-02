import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import { normalizeChangedFilePath } from "./identity";

/**
 * Unknown paths in diffs are ignored; unmatched files keep prior flags.
 * Path match uses normalizeChangedFilePath on both sides.
 * Returns `files` itself when no flag changes, so memos keyed on the file
 * list survive a streamed batch.
 */
export function enrichInventory(
  files: ChangedFile[],
  diffs: readonly FileDiffResult[],
): ChangedFile[] {
  if (diffs.length === 0) return files;

  const batchByPath = new Map(
    diffs.map((diff) => [normalizeChangedFilePath(diff.path), diff]),
  );
  let changed = false;
  const next = files.map((file) => {
    const diff = batchByPath.get(normalizeChangedFilePath(file.path));
    if (!diff || diff.isBinary === file.isBinary) return file;
    changed = true;
    return { ...file, isBinary: diff.isBinary };
  });
  return changed ? next : files;
}
