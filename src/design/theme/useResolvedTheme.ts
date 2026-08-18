import { useEffect, useState } from "react";
import { applyDocumentTheme, resolveAppThemeMode } from "./documentTheme";
import { applyThemeVariables } from "./index";
import { DEFAULT_THEME_ID, type ThemeId } from "./registry";

type ThemeMode = "light" | "dark" | "system";

export function useResolvedTheme(themeMode: ThemeMode) {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveAppThemeMode(themeMode),
  );

  useEffect(() => {
    applyDocumentTheme(themeMode);
    if (themeMode !== "system") {
      setResolvedTheme(themeMode);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setResolvedTheme(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [themeMode]);

  return resolvedTheme;
}

/** Palette vars on documentElement so portals and Pierre hosts inherit. */
export function useAppTheme(
  scheme: "light" | "dark",
  themeId: ThemeId = DEFAULT_THEME_ID,
): void {
  useEffect(() => {
    applyThemeVariables(document.documentElement, scheme, themeId);
  }, [scheme, themeId]);
}
