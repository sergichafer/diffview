/**
 * Visible branch name length in the compare bar (each side).
 * Keep in sync with `--compare-branch-chars` in compare.css.
 */
const COMPARE_BRANCH_MAX_CHARS = 14;

export function truncateBranchLabel(
  name: string,
  maxChars: number = COMPARE_BRANCH_MAX_CHARS,
): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars - 1)}…`;
}
