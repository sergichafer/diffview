import { describe, expect, test } from "bun:test";
import { resolveActivePathAfterOverview } from "./useActiveFileNavigation";

describe("resolveActivePathAfterOverview", () => {
  test("keeps prev when it is still in the file list", () => {
    const files = [{ path: "a.ts" }, { path: "b.ts" }];
    expect(resolveActivePathAfterOverview("b.ts", files)).toBe("b.ts");
  });

  test("falls back to the first file when prev is missing", () => {
    const files = [{ path: "a.ts" }, { path: "b.ts" }];
    expect(resolveActivePathAfterOverview("gone.ts", files)).toBe("a.ts");
  });

  test("selects the first file when prev is null", () => {
    const files = [{ path: "a.ts" }, { path: "b.ts" }];
    expect(resolveActivePathAfterOverview(null, files)).toBe("a.ts");
  });

  test("returns null when the file list is empty", () => {
    expect(resolveActivePathAfterOverview("a.ts", [])).toBeNull();
    expect(resolveActivePathAfterOverview(null, [])).toBeNull();
  });

  test("treats persisted seed like any other prev path", () => {
    const files = [{ path: "a.ts" }, { path: "mid.ts" }, { path: "z.ts" }];
    expect(resolveActivePathAfterOverview("mid.ts", files)).toBe("mid.ts");
    expect(resolveActivePathAfterOverview("missing.ts", files)).toBe("a.ts");
  });
});
