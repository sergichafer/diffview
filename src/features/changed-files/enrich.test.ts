import { describe, expect, test } from "bun:test";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import { enrichInventory } from "./enrich";

function file(path: string, isBinary = false): ChangedFile {
  return { path, badges: ["committed"], isBinary };
}

function diff(path: string, isBinary: boolean): FileDiffResult {
  return { path, patch: "", isBinary, oldPath: null };
}

describe("enrichInventory", () => {
  test("maps isBinary by path", () => {
    const files = [file("a.bin"), file("b.ts")];
    const diffs = [diff("a.bin", true)];
    expect(enrichInventory(files, diffs)).toEqual([
      file("a.bin", true),
      file("b.ts", false),
    ]);
  });

  test("leaves non-matching files unchanged", () => {
    const files = [file("keep.ts")];
    expect(enrichInventory(files, [diff("other.ts", true)])).toEqual([
      file("keep.ts"),
    ]);
  });

  test("second batch updates binary flags", () => {
    let files = [file("a.bin"), file("b.bin")];
    files = enrichInventory(files, [diff("a.bin", true)]);
    files = enrichInventory(files, [diff("b.bin", true)]);
    expect(files).toEqual([file("a.bin", true), file("b.bin", true)]);
  });

  test("matches via normalized path keys", () => {
    const files = [file("foo.ts")];
    const diffs = [diff("a/foo.ts", true)];
    expect(enrichInventory(files, diffs)[0]?.isBinary).toBe(true);
  });

  test("empty diffs returns a copy", () => {
    const files = [file("x.ts")];
    const result = enrichInventory(files, []);
    expect(result).toEqual(files);
    expect(result).not.toBe(files);
  });
});
