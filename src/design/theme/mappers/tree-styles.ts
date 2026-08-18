import { themeToTreeStyles, type TreeThemeStyles } from "@pierre/trees";
import type { ThemeDefinition } from "../types";
import { createShikiTheme } from "./shiki-theme";

export function rolesToTreeStyles(
  definition: ThemeDefinition,
  uiFontStack?: string,
): TreeThemeStyles {
  const theme = createShikiTheme(definition);
  const { roles } = definition;

  return {
    ...themeToTreeStyles({
      type: definition.scheme,
      bg: theme.bg,
      fg: theme.fg,
      colors: theme.colors as Record<string, string>,
    }),
    "--trees-selected-bg-override": roles.list.activeSelectionBg,
    "--trees-selected-fg-override": roles.list.activeSelectionFg,
    "--trees-border-color-override": "transparent",
    "--trees-fg-override": roles.fg.muted,
    "--trees-fg-muted-override": roles.fg.muted,
    /** Tree column is editor-colored inside the sheet, not the window shelf.
     * themeToTreeStyles also bakes a literal background-color onto the host
     * from sideBar.background; left alone it shows shelf grey through the
     * tree's inline padding and scrollbar gutter. */
    "--trees-bg-override": roles.bg.editor,
    backgroundColor: roles.bg.editor,
    "--trees-font-weight-semibold-override": "400",
    ...(uiFontStack
      ? { "--trees-font-family-override": uiFontStack }
      : {}),
  };
}
