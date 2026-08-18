import { describe, expect, test } from "bun:test";
import {
  appendCodeViewItems,
  buildCodeViewItems,
  clearItemCacheForTests,
  diffCacheKey,
} from "./buildItems";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";

const samplePatch = `diff --git a/foo.ts b/foo.ts
index 1234567..89abcde 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1 +1,2 @@
 line
+added
`;

function file(path: string): ChangedFile {
  return { path, badges: ["committed"], isBinary: false };
}

function diff(path: string, patch = samplePatch): FileDiffResult {
  return { path, patch, isBinary: false, oldPath: null };
}

describe("buildCodeViewItems", () => {
  test("orders paths like the file tree", () => {
    clearItemCacheForTests();
    const files = [file("foo.ts"), file("foo/bar.ts")];
    const results = [diff("foo.ts"), diff("foo/bar.ts")];
    const { items } = buildCodeViewItems(results, files);
    expect(items.map((item) => item.id)).toEqual(["foo/bar.ts", "foo.ts"]);
  });

  test("text diffs are editable candidates; items start with edit:false", () => {
    clearItemCacheForTests();
    const files = [file("foo.ts"), file("logo.png")];
    const results = [
      diff("foo.ts"),
      {
        path: "logo.png",
        patch:
          "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n",
        isBinary: true,
        oldPath: null,
      } satisfies FileDiffResult,
    ];
    const { items, editablePaths } = buildCodeViewItems(results, files);
    expect(items.find((i) => i.id === "foo.ts")?.edit).toBe(false);
    expect(items.find((i) => i.id === "logo.png")?.edit).toBe(false);
    expect(editablePaths.has("foo.ts")).toBe(true);
    expect(editablePaths.has("logo.png")).toBe(false);
  });

  test("reuses cached items when patch is unchanged", () => {
    clearItemCacheForTests();
    const files = [file("only.ts")];
    const results = [diff("only.ts")];
    const first = buildCodeViewItems(results, files);
    const second = buildCodeViewItems(results, files);
    expect(first.items[0]).toBe(second.items[0]);
  });

  test("cache key changes when patch changes", () => {
    expect(diffCacheKey("a.ts", "patch-a")).not.toBe(
      diffCacheKey("a.ts", "patch-b"),
    );
  });

  test("identical patch + different mergeBase yields a fresh item", () => {
    clearItemCacheForTests();
    const files = [file("only.ts")];
    const results = [diff("only.ts")];
    const first = buildCodeViewItems(results, files, "mb-a", "head-1");
    const second = buildCodeViewItems(results, files, "mb-b", "head-1");
    expect(first.items[0]).not.toBe(second.items[0]);
    expect(diffCacheKey("only.ts", samplePatch, "mb-a", "head-1")).not.toBe(
      diffCacheKey("only.ts", samplePatch, "mb-b", "head-1"),
    );
  });

  test("builds a new item when patch changes", () => {
    clearItemCacheForTests();
    const files = [file("only.ts")];
    const first = buildCodeViewItems([diff("only.ts", samplePatch)], files);
    const updatedPatch = samplePatch.replace("+added", "+changed");
    const second = buildCodeViewItems([diff("only.ts", updatedPatch)], files);
    expect(first.items[0]).not.toBe(second.items[0]);
  });

  test("appendCodeViewItems adds only new paths and preserves order", () => {
    clearItemCacheForTests();
    const files = [file("foo.ts"), file("foo/bar.ts"), file("baz.ts")];
    const firstBatch = buildCodeViewItems(
      [diff("foo.ts"), diff("foo/bar.ts")],
      files,
    );
    const { items, added, editablePaths } = appendCodeViewItems(
      firstBatch.items,
      firstBatch.editablePaths,
      [diff("baz.ts")],
      files,
    );
    expect(added).toHaveLength(1);
    expect(added[0]?.id).toBe("baz.ts");
    // Tree order: folder foo/ first, then root files (baz before foo).
    expect(items.map((item) => item.id)).toEqual([
      "foo/bar.ts",
      "baz.ts",
      "foo.ts",
    ]);
    expect(items[0]).toBe(firstBatch.items[0]);
    expect(items[2]).toBe(firstBatch.items[1]);
    expect(editablePaths.has("baz.ts")).toBe(true);
    expect(editablePaths.has("foo.ts")).toBe(true);
  });

  test("binary files get a standard binary diff item", () => {
    clearItemCacheForTests();
    const files = [file("assets/logo.png")];
    const results = [
      {
        path: "assets/logo.png",
        patch: "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n",
        isBinary: true,
        oldPath: null,
      } satisfies FileDiffResult,
    ];
    const { items, editablePaths } = buildCodeViewItems(results, files);
    expect(items).toHaveLength(1);
    expect(items[0]?.annotations).toBeUndefined();
    // Pierre 1.2.12 parses the binary placeholder patch into a FileDiff with
    // zero hunks; the item is still built as a standard binary diff item.
    expect(items[0]?.fileDiff.hunks).toHaveLength(0);
    expect(editablePaths.has("assets/logo.png")).toBe(false);
  });

  test("empty-file git header still builds a CodeView item", () => {
    clearItemCacheForTests();
    const files = [file("empty.txt")];
    const results = [
      diff(
        "empty.txt",
        "diff --git a/empty.txt b/empty.txt\n--- a/empty.txt\n+++ b/empty.txt\n",
      ),
    ];
    const { items } = buildCodeViewItems(results, files);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("empty.txt");
  });
});
