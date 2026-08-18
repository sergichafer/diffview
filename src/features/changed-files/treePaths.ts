import { normalizeChangedFilePath } from "./identity";

/**
 * Paths safe for @pierre/trees: omit a changed file when another path treats it as a
 * directory (e.g. both `libe131` and `libe131/foo`; Pierre cannot model both).
 * Invariant: all outputs are normalizeChangedFilePath'd.
 */
export function treePaths(paths: readonly string[]): string[] {
  const list = paths.map(normalizeChangedFilePath);
  return list.filter((p) => {
    const hasChild = list.some(
      (other) => other !== p && other.startsWith(`${p}/`),
    );
    return !hasChild;
  });
}
