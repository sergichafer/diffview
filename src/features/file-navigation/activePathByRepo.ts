/**
 * Per-comparison active-path prefs stored in `AppSettings.activePathByComparison`.
 */

export function getActivePathForComparison(
  byComparison: Record<string, string>,
  key: string,
): string | null {
  return byComparison[key] ?? null;
}

/**
 * Same-ref when the entry already matches. `null`/empty deletes the key
 * (stale or empty overview).
 */
export function setActivePathForComparison(
  byComparison: Record<string, string>,
  key: string,
  activePath: string | null,
): Record<string, string> {
  if (activePath == null || activePath === "") {
    if (!(key in byComparison)) return byComparison;
    const next = { ...byComparison };
    delete next[key];
    return next;
  }
  if (byComparison[key] === activePath) return byComparison;
  return { ...byComparison, [key]: activePath };
}
