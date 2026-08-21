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

  test("departure-mono uses the upstream family name then system UI fallbacks", () => {
    const stack = uiFontStack("departure-mono");
    expect(stack.startsWith('"Departure Mono"')).toBe(true);
    expect(stack).toContain("system-ui");
  });
});

describe("codeFontStack", () => {
  test("jetbrains includes JetBrains Mono then system mono fallbacks", () => {
    const stack = codeFontStack("jetbrains-mono");
    expect(stack.startsWith('"JetBrains Mono"')).toBe(true);
    expect(stack).toContain("ui-monospace");
  });

  test("departure-mono uses the upstream family name then system mono fallbacks", () => {
    const stack = codeFontStack("departure-mono");
    expect(stack.startsWith('"Departure Mono"')).toBe(true);
    expect(stack).toContain("ui-monospace");
  });
});
