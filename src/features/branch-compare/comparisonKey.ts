export type ComparisonKey = string;

export function makeComparisonKey(
  repoPath: string,
  base: string,
  head: string,
): ComparisonKey {
  return `${repoPath}|${base}|${head}`;
}

const SLICE_PREFIX = "slice:";

/**
 * One history slot per source comparison. `encodeURIComponent` hides `|`,
 * and `makeComparisonKey` always contains `|`, so the two keys cannot collide.
 */
export function sliceComparisonKey(sourceKey: ComparisonKey): ComparisonKey {
  return `${SLICE_PREFIX}${encodeURIComponent(sourceKey)}`;
}

export function sourceKeyOfSlice(key: ComparisonKey): ComparisonKey | null {
  if (!key.startsWith(SLICE_PREFIX)) return null;
  const encoded = key.slice(SLICE_PREFIX.length);
  if (encoded === "" || encoded.includes("|")) return null;
  try {
    const source = decodeURIComponent(encoded);
    if (source === "") return null;
    return source;
  } catch {
    return null;
  }
}
