import { describe, expect, test } from "bun:test";
import { codeFontStack, uiFontStack } from "./stacks";

describe("uiFontStack", () => {
  test("Inter uses the variable family name from fontsource", () => {
    expect(uiFontStack("inter")).toContain("Inter Variable");
  });

  test("system uses the OS UI stack without a webfont name", () => {
    expect(uiFontStack("system")).toBe(
      'system-ui, -apple-system, "Segoe UI", sans-serif',
    );
  });
});

describe("codeFontStack", () => {
  test("jetbrains includes JetBrains Mono then system mono fallbacks", () => {
    const stack = codeFontStack("jetbrains-mono");
    expect(stack.startsWith('"JetBrains Mono"')).toBe(true);
    expect(stack).toContain("ui-monospace");
  });
});
