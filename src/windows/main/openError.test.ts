import { describe, expect, test } from "bun:test";
import { withoutPathErrors } from "./openError";

describe("withoutPathErrors", () => {
  test("drops the parts for the given paths", () => {
    const error = "/cache/a.git/: not found; /repos/b: permission denied";
    expect(withoutPathErrors(error, ["/cache/a.git/"])).toBe(
      "/repos/b: permission denied",
    );
    expect(withoutPathErrors(error, ["/cache/a.git/", "/repos/b"])).toBeNull();
  });

  test("keeps the error when no path matches", () => {
    expect(withoutPathErrors("/repos/b: gone", [])).toBe("/repos/b: gone");
    expect(withoutPathErrors("/repos/b: gone", ["/repos/bc"])).toBe(
      "/repos/b: gone",
    );
    expect(withoutPathErrors(null, ["/repos/b"])).toBeNull();
  });
});
