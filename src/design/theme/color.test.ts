import { describe, expect, test } from "bun:test";
import { withHexAlpha } from "./color";
import { harmonyDarkRoles } from "./themes/harmony-dark";

describe("withHexAlpha", () => {
  test("hex + byte matches vscode concat for Harmony dark elevated and success", () => {
    expect(withHexAlpha(harmonyDarkRoles.bg.elevated, 0x8c)).toBe(
      `${harmonyDarkRoles.bg.elevated}8c`,
    );
    expect(withHexAlpha(harmonyDarkRoles.bg.elevated, 0x8c)).toBe("#1d1d228c");
    expect(withHexAlpha(harmonyDarkRoles.states.success, 0x1f)).toBe(
      `${harmonyDarkRoles.states.success}1f`,
    );
  });

  test("replaces alpha on rgba without concatenating", () => {
    expect(withHexAlpha("rgba(29, 29, 34, 0.5)", 0x8c)).toBe("#1d1d228c");
  });

  test("returns unparseable input unchanged", () => {
    expect(withHexAlpha("not-a-color", 0x8c)).toBe("not-a-color");
  });
});
