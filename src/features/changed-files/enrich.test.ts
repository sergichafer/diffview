import { describe, expect, test } from "bun:test";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import { enrichInventory } from "./enrich";

function file(path: string, isBinary = false): ChangedFile {
  return { path, badges: ["committed"], isBinary };
}

function diff(path: string, isBinary: boolean): FileDiffResult {
  return { path, patch: "", isBinary, oldPath: null, additions: 0, deletions: 0 };
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

  test("returns the same array when no flag changes", () => {
    const files = [file("x.ts"), file("y.bin", true)];
    expect(enrichInventory(files, [])).toBe(files);
    expect(enrichInventory(files, [diff("x.ts", false), diff("y.bin", true)])).toBe(files);
  });

  test("keeps unchanged entries by identity when one flag moves", () => {
    const files = [file("x.ts"), file("y.bin")];
    const result = enrichInventory(files, [diff("y.bin", true)]);
    expect(result).not.toBe(files);
    expect(result[0]).toBe(files[0]);
  });
});
