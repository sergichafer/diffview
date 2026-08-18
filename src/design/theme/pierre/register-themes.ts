import { registerCustomTheme } from "@pierre/diffs";
import { createShikiTheme } from "../mappers/shiki-theme";
import { THEME_IDS, THEMES } from "../registry";

let registered = false;

/** Must run before WorkerPool / CodeView init. */
export function ensureDiffviewThemesRegistered(): void {
  if (registered) return;
  registered = true;

  for (const themeId of THEME_IDS) {
    for (const scheme of ["dark", "light"] as const) {
      const definition = THEMES[themeId][scheme];
      registerCustomTheme(definition.pierreThemeName, async () =>
        createShikiTheme(definition),
      );
    }
  }
}

ensureDiffviewThemesRegistered();
