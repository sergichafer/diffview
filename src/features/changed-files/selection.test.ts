import { describe, expect, test } from "bun:test";
import { resolveSelectionToFile } from "./selection";

describe("resolveSelectionToFile", () => {
  test("returns the file when selected directly", () => {
    const changed = ["src/a.ts", "src/nested/b.ts"];
    expect(resolveSelectionToFile("src/a.ts", changed)).toBe("src/a.ts");
  });

  test("resolves a folder to the first tree-ordered file inside", () => {
    const changed = ["src/nested/b.ts", "src/nested/deep/c.txt"];
    expect(resolveSelectionToFile("src/nested", changed)).toBe(
      "src/nested/deep/c.txt",
    );
  });

  test("does not prefer previewable files over tree order", () => {
    // Tree order: nested/deep/c.md before nested/b.ts (folder before sibling file).
    // With .ts listed first in the folder then .md, first tree-ordered child wins.
    const changed = ["src/nested/b.ts", "src/nested/a.md"];
    expect(resolveSelectionToFile("src/nested", changed)).toBe(
      "src/nested/a.md",
    );

    // When .ts sorts before .md at the same level, .ts wins (no markdown jump).
    const sameLevel = ["src/nested/b.ts", "src/nested/c.md"];
    expect(resolveSelectionToFile("src/nested", sameLevel)).toBe(
      "src/nested/b.ts",
    );
  });

  test("returns null when the folder has no changed files", () => {
    expect(resolveSelectionToFile("lib", ["src/nested/b.ts"])).toBeNull();
  });
});
