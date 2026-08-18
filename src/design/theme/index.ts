import {
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  normalizeCodeFont,
  normalizeUiFont,
} from "@/design/fonts/normalize";
import { codeFontStack, uiFontStack } from "@/design/fonts/stacks";
import type { CodeFontId, UiFontId } from "@/design/fonts/types";
import { rolesToCssVariables } from "./mappers/css-variables";
import { buildDiffLayoutUnsafeCss } from "./pierre/diff-layout-unsafe-css";
import {
  DEFAULT_THEME_ID,
  getThemeDefinition,
  type ThemeId,
} from "./registry";
import { rolesToTreeStyles } from "./mappers/tree-styles";
import type { ColorScheme } from "./types";

export type { ColorScheme, ThemeRoles } from "./types";
export type { ThemeId } from "./registry";
export {
  DEFAULT_THEME_ID,
  getPierreThemePair,
  getThemeDefinition,
  THEME_IDS,
  THEMES,
} from "./registry";

export function applyThemeVariables(
  element: HTMLElement,
  scheme: ColorScheme,
  themeId: ThemeId = DEFAULT_THEME_ID,
): void {
  const definition = getThemeDefinition(themeId, scheme);
  const vars = rolesToCssVariables(definition.roles);

  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
}

export function diffLayoutUnsafeCss(
  scheme: ColorScheme,
  themeId: ThemeId = DEFAULT_THEME_ID,
  uiFont: UiFontId = DEFAULT_UI_FONT,
  codeFont: CodeFontId = DEFAULT_CODE_FONT,
): string {
  const ui = normalizeUiFont(uiFont);
  const code = normalizeCodeFont(codeFont);
  return buildDiffLayoutUnsafeCss(getThemeDefinition(themeId, scheme).roles, {
    ui: uiFontStack(ui),
    mono: codeFontStack(code),
  });
}

export function appTreeStyles(
  scheme: ColorScheme,
  themeId: ThemeId = DEFAULT_THEME_ID,
  uiFont: UiFontId = DEFAULT_UI_FONT,
) {
  return rolesToTreeStyles(
    getThemeDefinition(themeId, scheme),
    uiFontStack(normalizeUiFont(uiFont)),
  );
}
