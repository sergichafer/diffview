import { describe, expect, test } from "bun:test";
import {
  appendCodeViewItems,
  buildCodeViewItems,
  clearItemCacheForTests,
  diffCacheKey,
  pathRanks,
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
  return { path, patch, isBinary: false, oldPath: null, additions: 0, deletions: 0 };
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
        additions: 0,
        deletions: 0,
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
      pathRanks(files),
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

  test("appending batches in any order matches one full build", () => {
    const paths = [
      "src/b.ts",
      "src/a/x.ts",
      ".github/ci.yml",
      "README.md",
      "src/a10.ts",
      "src/a2.ts",
      "lib",
      "lib/inner.ts",
      "z.ts",
    ];
    const files = paths.map(file);
    const results = paths.map((path) => diff(path));
    clearItemCacheForTests();
    const full = buildCodeViewItems(results, files);
    const ranks = pathRanks(files);

    for (const order of [
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
      [4, 0, 8, 2, 6, 1, 7, 3, 5],
    ]) {
      clearItemCacheForTests();
      let items = buildCodeViewItems([results[order[0]!]!], files).items;
      let editable = new Set(items.map((item) => item.id));
      for (let i = 1; i < order.length; i += 2) {
        const batch = order.slice(i, i + 2).map((index) => results[index]!);
        const next = appendCodeViewItems(items, editable, batch, ranks);
        items = next.items;
        editable = next.editablePaths;
      }
      expect(items.map((item) => item.id)).toEqual(full.items.map((item) => item.id));
      expect([...editable].sort()).toEqual([...full.editablePaths].sort());
    }
  });

  test("appendCodeViewItems skips paths already present or outside the file list", () => {
    clearItemCacheForTests();
    const files = [file("a.ts"), file("b.ts")];
    const first = buildCodeViewItems([diff("a.ts")], files);
    const { items, added } = appendCodeViewItems(
      first.items,
      first.editablePaths,
      [diff("a.ts"), diff("b.ts"), diff("b.ts"), diff("stray.ts")],
      pathRanks(files),
    );
    expect(items.map((item) => item.id)).toEqual(["a.ts", "b.ts"]);
    expect(items[0]).toBe(first.items[0]);
    expect(added.map((item) => item.id)).toEqual(["b.ts"]);
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
        additions: 0,
        deletions: 0,
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
