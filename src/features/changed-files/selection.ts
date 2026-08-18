import { normalizeChangedFilePath } from "./identity";
import { orderedPaths } from "./order";

/** Folder resolve uses orderedPaths only; no preview / MIME policy. */
export function resolveSelectionToFile(
  selectedPath: string,
  inventoryPaths: readonly string[],
): string | null {
  const normalized = inventoryPaths.map(normalizeChangedFilePath);
  const pathNorm = normalizeChangedFilePath(selectedPath);

  if (normalized.includes(pathNorm)) {
    return pathNorm;
  }

  const dir = pathNorm.replace(/\/$/, "");
  const prefix = `${dir}/`;
  const inDir = orderedPaths(normalized.filter((p) => p.startsWith(prefix)));

  if (inDir.length === 0) {
    return null;
  }

  return inDir[0];
}
