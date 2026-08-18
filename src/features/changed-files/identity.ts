/**
 * Repo-relative path id used as tree row, CodeView item id, and selection key.
 * Union of former slash-only and git-prefix normalizers.
 */
export function normalizeChangedFilePath(path: string): string {
  let normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("a/")) normalized = normalized.slice(2);
  else if (normalized.startsWith("b/")) normalized = normalized.slice(2);
  return normalized;
}

/** Identity of an overview file list; identity change triggers reconcile/restore. */
export function fileListKey(files: readonly { path: string }[]): string {
  return files.map((file) => file.path).join("\0");
}
