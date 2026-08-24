import { ayuLightRoles } from "./themes/ayu-light";
import { ayuMirageRoles } from "./themes/ayu-mirage";
import { catppuccinDarkRoles } from "./themes/catppuccin-dark";
import { catppuccinLightRoles } from "./themes/catppuccin-light";
import { harmonyDarkRoles } from "./themes/harmony-dark";
import { harmonyLightRoles } from "./themes/harmony-light";
import type { ColorScheme, ThemeDefinition } from "./types";

export const THEME_CATALOG = [
  {
    id: "harmony" as const,
    label: "Harmony",
    dark: harmonyDarkRoles,
    light: harmonyLightRoles,
  },
  {
    id: "ayu" as const,
    label: "Ayu",
    dark: ayuMirageRoles,
    light: ayuLightRoles,
  },
  {
    id: "catppuccin" as const,
    label: "Catppuccin",
    dark: catppuccinDarkRoles,
    light: catppuccinLightRoles,
  },
];

export type ThemeId = (typeof THEME_CATALOG)[number]["id"];

export const DEFAULT_THEME_ID: ThemeId = "harmony";

export const THEME_IDS = THEME_CATALOG.map((row) => row.id);

export const THEME_OPTIONS = THEME_CATALOG.map((row) => ({
  value: row.id,
  label: row.label,
}));

function definitionFor(
  row: (typeof THEME_CATALOG)[number],
  scheme: ColorScheme,
): ThemeDefinition {
  const light = scheme === "light";
  return {
    id: row.id,
    scheme,
    pierreThemeName: light ? `diffview-${row.id}-light` : `diffview-${row.id}`,
    pierreBase: light ? "pierre-light" : "pierre-dark",
    roles: light ? row.light : row.dark,
  };
}

export const THEMES = Object.fromEntries(
  THEME_CATALOG.map((row) => [
    row.id,
    {
      dark: definitionFor(row, "dark"),
      light: definitionFor(row, "light"),
    },
  ]),
) as Record<ThemeId, Record<ColorScheme, ThemeDefinition>>;

const THEME_ID_SET = new Set<string>(THEME_IDS);

export function normalizeThemeId(value: unknown): ThemeId {
  if (typeof value === "string" && THEME_ID_SET.has(value)) {
    return value as ThemeId;
  }
  return DEFAULT_THEME_ID;
}

export function getThemeDefinition(
  themeId: string,
  scheme: ColorScheme,
): ThemeDefinition {
  return THEMES[normalizeThemeId(themeId)][scheme];
}

function getPierreThemeName(themeId: string, scheme: ColorScheme): string {
  return getThemeDefinition(themeId, scheme).pierreThemeName;
}

export function getPierreThemePair(themeId: ThemeId = DEFAULT_THEME_ID): {
  dark: string;
  light: string;
} {
  return {
    dark: getPierreThemeName(themeId, "dark"),
    light: getPierreThemeName(themeId, "light"),
  };
}
