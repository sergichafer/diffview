import { describe, expect, test } from "bun:test";
import { normalizeChangedFilePath } from "./identity";

describe("normalizeChangedFilePath", () => {
  test("normalizes backslashes", () => {
    expect(normalizeChangedFilePath("src\\a.ts")).toBe("src/a.ts");
  });

  test("strips leading ./", () => {
    expect(normalizeChangedFilePath("./foo.ts")).toBe("foo.ts");
  });

  test("strips git a/ and b/ prefixes", () => {
    expect(normalizeChangedFilePath("a/foo.ts")).toBe("foo.ts");
    expect(normalizeChangedFilePath("b/foo.ts")).toBe("foo.ts");
  });

  test("handles mixed separators and prefixes", () => {
    expect(normalizeChangedFilePath("a\\src\\foo.ts")).toBe("src/foo.ts");
    expect(normalizeChangedFilePath("./b/nested/x.ts")).toBe("nested/x.ts");
  });

  test("is idempotent", () => {
    const once = normalizeChangedFilePath("a/src\\foo.ts");
    expect(once).toBe("src/foo.ts");
    expect(normalizeChangedFilePath(once)).toBe(once);
  });

  test("leaves empty and nested repo paths alone", () => {
    expect(normalizeChangedFilePath("")).toBe("");
    expect(normalizeChangedFilePath("src/nested/deep.ts")).toBe(
      "src/nested/deep.ts",
    );
  });
});
