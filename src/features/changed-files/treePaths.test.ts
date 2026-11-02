import { describe, expect, test } from "bun:test";
import { normalizeChangedFilePath } from "./identity";
import { treePaths } from "./treePaths";

describe("treePaths", () => {
  test("drops a file path when a child path exists", () => {
    expect(treePaths(["libe131", "libe131/foo.ts"])).toEqual([
      "libe131/foo.ts",
    ]);
  });

  test("normalizes before filtering", () => {
    const paths = treePaths(["src\\a.ts", "src/b.ts"]);
    expect(paths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(normalizeChangedFilePath("src\\a.ts")).toBe("src/a.ts");
  });

  test("keeps unrelated paths", () => {
    // Avoid top-level a/ or b/ dirs; identity strips those as git path prefixes.
    const input = ["x.ts", "dir/c.ts"];
    expect(treePaths(input)).toEqual(input);
  });
});

describe("treePaths directory detection", () => {
  test("drops a file shadowed by a deeper descendant", () => {
    expect(treePaths(["a1", "a1/x/y/z.ts", "a1x.ts"])).toEqual([
      "a1/x/y/z.ts",
      "a1x.ts",
    ]);
  });

  test("a sibling sharing a name prefix is not a child", () => {
    expect(treePaths(["lib", "library/a.ts"])).toEqual(["lib", "library/a.ts"]);
  });

  test("keeps duplicate entries of a leaf", () => {
    expect(treePaths(["x.ts", "x.ts"])).toEqual(["x.ts", "x.ts"]);
  });
});
