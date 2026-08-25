import type { FileDiffMetadata } from "@pierre/diffs";

function lineText(
  fileDiff: FileDiffMetadata,
  side: "additions" | "deletions",
  line: number,
): string | null {
  const isAdditions = side === "additions";
  for (const hunk of fileDiff.hunks) {
    const start = isAdditions ? hunk.additionStart : hunk.deletionStart;
    const count = isAdditions ? hunk.additionCount : hunk.deletionCount;
    if (line < start || line >= start + count) continue;
    const index =
      (isAdditions ? hunk.additionLineIndex : hunk.deletionLineIndex) +
      (line - start);
    const pool = isAdditions ? fileDiff.additionLines : fileDiff.deletionLines;
    const raw = pool[index];
    if (raw == null) return null;
    return raw.replace(/\r?\n$/, "");
  }
  return null;
}

/** Lines `start..end` (1-based, inclusive) on one side. Skips hunk gaps. */
export function extractSnippet(
  fileDiff: FileDiffMetadata,
  side: "additions" | "deletions",
  start: number,
  end: number,
): string {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const lines: string[] = [];
  for (let line = lo; line <= hi; line++) {
    const text = lineText(fileDiff, side, line);
    if (text != null) lines.push(text);
  }
  return lines.join("\n");
}
