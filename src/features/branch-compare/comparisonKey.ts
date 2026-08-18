export type ComparisonKey = string;

export function makeComparisonKey(
  repoPath: string,
  base: string,
  head: string,
): ComparisonKey {
  return `${repoPath}|${base}|${head}`;
}
