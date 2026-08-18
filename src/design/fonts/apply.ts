import { codeFontStack, uiFontStack } from "./stacks";
import type { CodeFontId, UiFontId } from "./types";

/** Write typography CSS variables (independent of themeId). */
export function applyFontVariables(
  element: HTMLElement,
  uiFont: UiFontId,
  codeFont: CodeFontId,
): void {
  element.style.setProperty("--font-ui", uiFontStack(uiFont));
  element.style.setProperty("--font-mono", codeFontStack(codeFont));
}
