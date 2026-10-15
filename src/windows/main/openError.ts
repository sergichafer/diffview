/**
 * Startup `openError` without the parts for `paths`. The backend formats each
 * part as `<path>: <error>` and joins them with `"; "`.
 */
export function withoutPathErrors(
  openError: string | null,
  paths: readonly string[],
): string | null {
  if (openError == null || paths.length === 0) return openError;
  const kept = openError
    .split("; ")
    .filter((part) => !paths.some((path) => part.startsWith(`${path}: `)));
  return kept.length > 0 ? kept.join("; ") : null;
}
