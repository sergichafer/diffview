import { normalizeChangedFilePath } from "./identity";

/**
 * Paths safe for @pierre/trees: omit a changed file when another path treats it as a
 * directory (e.g. both `libe131` and `libe131/foo`; Pierre cannot model both).
 * Invariant: all outputs are normalizeChangedFilePath'd.
 */
export function treePaths(paths: readonly string[]): string[] {
  const list = paths.map(normalizeChangedFilePath);
  const directories = new Set<string>();
  for (const path of list) {
    let slash = path.lastIndexOf("/");
    while (slash >= 0) {
      const directory = path.slice(0, slash);
      if (directories.has(directory)) break;
      directories.add(directory);
      slash = path.lastIndexOf("/", slash - 1);
    }
  }
  return list.filter((path) => !directories.has(path));
}
