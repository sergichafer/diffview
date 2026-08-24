import { describe, expect, test } from "bun:test";
import {
  DEFAULT_THEME_ID,
  getPierreThemePair,
  getThemeDefinition,
  normalizeThemeId,
  THEME_IDS,
  THEME_OPTIONS,
  THEMES,
} from "./registry";

describe("theme catalog", () => {
  test("THEME_IDS, THEME_OPTIONS values, and THEMES keys are the same set, Harmony first", () => {
    expect(THEME_IDS[0]).toBe("harmony");
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual([...THEME_IDS]);
    expect(Object.keys(THEMES)).toEqual([...THEME_IDS]);
  });

  test("every id has both dark and light", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id]?.dark).toBeDefined();
      expect(THEMES[id]?.light).toBeDefined();
    }
  });

  test("getPierreThemePair returns catalog pierre names", () => {
    expect(getPierreThemePair("harmony")).toEqual({
      dark: "diffview-harmony",
      light: "diffview-harmony-light",
    });
    expect(getPierreThemePair("ayu")).toEqual({
      dark: "diffview-ayu",
      light: "diffview-ayu-light",
    });
    expect(getPierreThemePair("catppuccin")).toEqual({
      dark: "diffview-catppuccin",
      light: "diffview-catppuccin-light",
    });
  });

  test("normalizeThemeId keeps known ids and falls back to harmony", () => {
    expect(normalizeThemeId("harmony")).toBe("harmony");
    expect(normalizeThemeId("ayu")).toBe("ayu");
    expect(normalizeThemeId("catppuccin")).toBe("catppuccin");
    expect(normalizeThemeId("not-a-theme")).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId("")).toBe("harmony");
    expect(normalizeThemeId(undefined)).toBe("harmony");
  });

  test("getThemeDefinition falls back to Harmony dark without throwing", () => {
    const definition = getThemeDefinition("not-a-theme", "dark");
    expect(definition.id).toBe("harmony");
    expect(definition.scheme).toBe("dark");
    expect(definition.pierreThemeName).toBe("diffview-harmony");
  });
});
