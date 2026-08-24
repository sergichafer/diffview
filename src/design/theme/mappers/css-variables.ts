import type { ThemeRoles } from "../types";

export function rolesToCssVariables(roles: ThemeRoles): Record<string, string> {
  const { bg, fg, border, accent, states, list, effects } = roles;

  return {
    "--bg-canvas": bg.editor,
    "--bg-window": bg.window,
    "--bg-inset": bg.inset,
    "--bg-elevated": bg.elevated,
    "--fg-base": fg.base,
    "--fg-muted": fg.muted,
    "--fg-accent": fg.accent,
    "--fg-accent-bright": fg.accentBright,
    "--border-default": border.default,
    "--border-strong": border.strong,
    "--border-focus": border.focus,
    "--seam": border.seam,
    "--border-highlight": border.highlight,
    "--accent-primary": accent.primary,
    "--accent-subtle": accent.subtle,
    "--state-success": states.success,
    "--state-danger": states.danger,
    "--state-merge": states.merge,
    "--state-info": states.info,
    "--list-hover": list.hoverBg,
    "--list-active": list.activeSelectionBg,
    "--scrollbar": list.scrollbar,
    "--ring-ink": effects.ringInk,
    "--ring-floor": effects.ringFloor,
    "--shell-shadow": effects.shellShadow,
  };
}
