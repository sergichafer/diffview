import { describe, expect, test } from "bun:test";
import { fileListKey } from "@/features/changed-files/identity";
import { reconcileActivePathForFiles } from "./useActiveFileNavigation";

describe("reconcileActivePathForFiles", () => {
  const files = [{ path: "a.ts" }, { path: "b.ts" }];

  test("same key returns stored path without commit", () => {
    const key = fileListKey(files);
    const result = reconcileActivePathForFiles("b.ts", key, files);
    expect(result).toEqual({
      path: "b.ts",
      key,
      shouldCommit: false,
    });
  });

  test("overview arrival from empty returns first file in the same result", () => {
    // Regression: setState-during-render alone left selectedPath null on the
    // overview paint, so Diff Workspace armed restore with null and never
    // scrolled to the active file after app/repo reopen.
    const result = reconcileActivePathForFiles(null, "", files);
    expect(result.shouldCommit).toBe(true);
    expect(result.path).toBe("a.ts");
    expect(result.key).toBe(fileListKey(files));
  });

  test("overview arrival keeps persisted seed path when still in the list", () => {
    // Reopen seeds selectedPath from settings.activePathByRepo before reconcile.
    const result = reconcileActivePathForFiles("b.ts", "", files);
    expect(result.shouldCommit).toBe(true);
    expect(result.path).toBe("b.ts");
  });

  test("overview arrival falls back when persisted seed path is stale", () => {
    const result = reconcileActivePathForFiles("gone.ts", "", files);
    expect(result.shouldCommit).toBe(true);
    expect(result.path).toBe("a.ts");
  });

  test("mount with files already present still reconciles when storedKey is empty", () => {
    // AppBody keeps BranchWorkspace unmounted until overview exists, so the
    // hook's first render often sees a full file list. storedKey must start
    // as "" (not fileListKey(files)) or this path stays null forever.
    const key = fileListKey(files);
    const trapped = reconcileActivePathForFiles(null, key, files);
    expect(trapped.shouldCommit).toBe(false);
    expect(trapped.path).toBeNull();

    const fixed = reconcileActivePathForFiles(null, "", files);
    expect(fixed.shouldCommit).toBe(true);
    expect(fixed.path).toBe("a.ts");
  });

  test("keeps previous path when still present after overview change", () => {
    const result = reconcileActivePathForFiles("b.ts", "old\0key", files);
    expect(result.path).toBe("b.ts");
    expect(result.shouldCommit).toBe(true);
  });

  test("falls back to first file when previous path is gone", () => {
    const result = reconcileActivePathForFiles("gone.ts", "old", files);
    expect(result.path).toBe("a.ts");
  });
});
