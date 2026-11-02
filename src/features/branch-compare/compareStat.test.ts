import { describe, expect, test } from "bun:test";
import type { FileDiffResult } from "@/shared/types/app";
import { computeAppliedStat } from "./compareStat";

function diff(additions: number, deletions: number): FileDiffResult {
  return {
    path: "f.sql",
    patch: "--- a/f.sql\n+++ b/f.sql\n--- note\n+++ x\n",
    isBinary: false,
    oldPath: null,
    additions,
    deletions,
  };
}

describe("computeAppliedStat", () => {
  test("sums backend line counts without reading patch text", () => {
    expect(computeAppliedStat(3, [diff(1, 1), diff(4, 0)])).toEqual({
      files: 3,
      additions: 5,
      deletions: 1,
    });
  });

  test("empty diff list counts zero lines", () => {
    expect(computeAppliedStat(2, [])).toEqual({ files: 2, additions: 0, deletions: 0 });
  });
});
