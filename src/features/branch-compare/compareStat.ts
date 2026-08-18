import type { FileDiffResult } from "@/shared/types/app";

export interface AppliedStat {
  files: number;
  additions: number;
  deletions: number;
}

/**
 * Diffstat for the *applied* comparison, from patches already loaded for the
 * overview. No hypothetical per-pair stats; only what the backend produced
 * for the current head/base.
 */
export function computeAppliedStat(
  fileCount: number,
  fileDiffs: readonly FileDiffResult[],
): AppliedStat {
  let additions = 0;
  let deletions = 0;

  for (const diff of fileDiffs) {
    if (diff.isBinary) continue;
    for (const line of diff.patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }
  }

  return { files: fileCount, additions, deletions };
}

/** Compact count: 1234 → "1.2k". */
export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Relative time from a Unix-seconds timestamp, e.g. "3h ago". */
export function formatRelativeTime(
  unixSeconds: number,
  now: number = Date.now(),
): string {
  if (!unixSeconds) return "";
  const diff = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < 4 * WEEK) return `${Math.floor(diff / WEEK)}w ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}
