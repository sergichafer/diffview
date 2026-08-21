import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  normalizeCodeFont,
  normalizeUiFont,
} from "./normalize";

describe("normalizeUiFont", () => {
  test("keeps known ids", () => {
    expect(normalizeUiFont("inter")).toBe("inter");
    expect(normalizeUiFont("system")).toBe("system");
    expect(normalizeUiFont("syne")).toBe("syne");
    expect(normalizeUiFont("ibm-plex-sans")).toBe("ibm-plex-sans");
    expect(normalizeUiFont("plus-jakarta-sans")).toBe("plus-jakarta-sans");
    expect(normalizeUiFont("departure-mono")).toBe("departure-mono");
  });

  test("falls back to Inter for unknown or missing values", () => {
    expect(normalizeUiFont(undefined)).toBe(DEFAULT_UI_FONT);
    expect(normalizeUiFont("comic-sans")).toBe(DEFAULT_UI_FONT);
    expect(normalizeUiFont("")).toBe(DEFAULT_UI_FONT);
  });
});

describe("normalizeCodeFont", () => {
  test("keeps known ids", () => {
    expect(normalizeCodeFont("system")).toBe("system");
    expect(normalizeCodeFont("jetbrains-mono")).toBe("jetbrains-mono");
    expect(normalizeCodeFont("ibm-plex-mono")).toBe("ibm-plex-mono");
    expect(normalizeCodeFont("source-code-pro")).toBe("source-code-pro");
    expect(normalizeCodeFont("departure-mono")).toBe("departure-mono");
  });

  test("falls back to System for unknown or missing values", () => {
    expect(normalizeCodeFont(undefined)).toBe(DEFAULT_CODE_FONT);
    expect(normalizeCodeFont("fira-code")).toBe(DEFAULT_CODE_FONT);
  });
});
