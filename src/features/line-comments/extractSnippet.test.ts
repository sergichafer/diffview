import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata, Hunk } from "@pierre/diffs";
import { extractSnippet } from "./extractSnippet";

function hunk(partial: {
  additionStart: number;
  additionCount: number;
  additionLineIndex: number;
  deletionStart: number;
  deletionCount: number;
  deletionLineIndex: number;
}): Hunk {
  return {
    collapsedBefore: 0,
    additionLines: 0,
    deletionLines: 0,
    hunkContent: [],
    splitLineStart: 0,
    splitLineCount: 0,
    unifiedLineStart: 0,
    unifiedLineCount: 0,
    noEOFCRDeletions: false,
    noEOFCRAdditions: false,
    ...partial,
  };
}

function fileDiff(
  additionLines: string[],
  deletionLines: string[],
  hunks: Hunk[],
): FileDiffMetadata {
  return {
    name: "f.ts",
    type: "change",
    isPartial: false,
    splitLineCount: 0,
    unifiedLineCount: 0,
    additionLines,
    deletionLines,
    hunks,
  };
}

describe("extractSnippet", () => {
  test("reads addition lines through hunk mapping", () => {
    const diff = fileDiff(
      ["alpha\n", "beta\n", "gamma\n"],
      [],
      [
        hunk({
          additionStart: 10,
          additionCount: 3,
          additionLineIndex: 0,
          deletionStart: 10,
          deletionCount: 0,
          deletionLineIndex: 0,
        }),
      ],
    );
    expect(extractSnippet(diff, "additions", 10, 12)).toBe("alpha\nbeta\ngamma");
    expect(extractSnippet(diff, "additions", 12, 10)).toBe("alpha\nbeta\ngamma");
  });

  test("reads deletion lines through hunk mapping", () => {
    const diff = fileDiff(
      [],
      ["old-a\n", "old-b\n"],
      [
        hunk({
          additionStart: 4,
          additionCount: 0,
          additionLineIndex: 0,
          deletionStart: 4,
          deletionCount: 2,
          deletionLineIndex: 0,
        }),
      ],
    );
    expect(extractSnippet(diff, "deletions", 4, 5)).toBe("old-a\nold-b");
  });

  test("skips lines that are not in any hunk", () => {
    const diff = fileDiff(
      ["keep-a\n", "keep-b\n", "keep-c\n"],
      [],
      [
        hunk({
          additionStart: 1,
          additionCount: 1,
          additionLineIndex: 0,
          deletionStart: 1,
          deletionCount: 0,
          deletionLineIndex: 0,
        }),
        hunk({
          additionStart: 8,
          additionCount: 2,
          additionLineIndex: 1,
          deletionStart: 8,
          deletionCount: 0,
          deletionLineIndex: 0,
        }),
      ],
    );
    expect(extractSnippet(diff, "additions", 1, 9)).toBe("keep-a\nkeep-b\nkeep-c");
    expect(extractSnippet(diff, "additions", 2, 7)).toBe("");
  });
});
