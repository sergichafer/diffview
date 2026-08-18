import { describe, expect, test } from "bun:test";
import { orderedPaths } from "./order";

describe("orderedPaths", () => {
  test("folders before sibling files at the same level", () => {
    const paths = ["foo.ts", "foo/bar.ts"];
    expect(orderedPaths(paths)).toEqual(["foo/bar.ts", "foo.ts"]);
  });

  test("differs from full-path lexicographic order", () => {
    const paths = ["foo.ts", "foo/bar.ts", "src/a.ts", "lib/b.ts"];
    const flat = [...paths].sort((a, b) => a.localeCompare(b));
    const tree = orderedPaths(paths);
    expect(flat[0]).toBe("foo.ts");
    expect(tree[0]).toBe("foo/bar.ts");
  });

  test("order is stable for nested paths with the same prefix", () => {
    const paths = ["src/a.ts", "src/nested/b.ts", "src/nested/c.ts"];
    const first = orderedPaths(paths);
    const second = orderedPaths([...paths].reverse());
    expect(first).toEqual(second);
    expect(first).toEqual(["src/nested/b.ts", "src/nested/c.ts", "src/a.ts"]);
  });

  test("uses natural numeric order within a folder like @pierre/trees", () => {
    const paths = [
      "src-tauri/icons/Square310x310Logo.png",
      "src-tauri/icons/Square30x30Logo.png",
      "src-tauri/icons/Square44x44Logo.png",
      "src-tauri/icons/Square107x107Logo.png",
    ];
    expect(orderedPaths(paths)).toEqual([
      "src-tauri/icons/Square30x30Logo.png",
      "src-tauri/icons/Square44x44Logo.png",
      "src-tauri/icons/Square107x107Logo.png",
      "src-tauri/icons/Square310x310Logo.png",
    ]);
  });
});
