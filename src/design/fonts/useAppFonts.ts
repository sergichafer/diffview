import { useEffect } from "react";
import { applyFontVariables } from "./apply";
import { ensureCodeFontLoaded, ensureUiFontLoaded } from "./load";
import { normalizeCodeFont, normalizeUiFont } from "./normalize";
import type { CodeFontId, UiFontId } from "./types";

/** Font tokens and face load; independent of themeId. */
export function useAppFonts(uiFont: UiFontId, codeFont: CodeFontId): void {
  const ui = normalizeUiFont(uiFont);
  const code = normalizeCodeFont(codeFont);

  useEffect(() => {
    applyFontVariables(document.documentElement, ui, code);
    void ensureUiFontLoaded(ui);
    void ensureCodeFontLoaded(code);
  }, [ui, code]);
}
