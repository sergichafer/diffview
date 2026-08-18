import type { ThemeId } from "./registry";

export type ColorScheme = "light" | "dark";

/** Semantic palette aligned with Pierre Roles, extended for Diffview chrome. */
export type ThemeRoles = {
  bg: {
    editor: string;
    window: string;
    inset: string;
    elevated: string;
  };
  fg: {
    base: string;
    muted: string;
    accent: string;
    accentBright: string;
  };
  border: {
    default: string;
    strong: string;
    focus: string;
    /** 1× seam strength (10%): horizontal section hairlines. Distinct from
     *  `default` / `strong` (control edges); decorative, not a 1.4.11 boundary. */
    seam: string;
    /** 2× seam strength (20%): Panels card stroke (`--seam-2` in the mock).
     *  Keep separate from `border.strong` so control edges can stay heavier. */
    seamStrong: string;
    /** Catch-light on elevated sheets (workspace, settings, palette).
     *  White 5% on dark, black 5% on light; same strength, inverted ink. */
    highlight: string;
  };
  accent: {
    primary: string;
    subtle: string;
    contrastOnAccent: string;
  };
  states: {
    success: string;
    danger: string;
    modified: string;
    merge: string;
    warn: string;
    info: string;
  };
  list: {
    activeSelectionBg: string;
    activeSelectionFg: string;
    inactiveSelectionBg: string;
    hoverBg: string;
    scrollbar: string;
  };
  effects: {
    /** Ink of the pointer-tracked ring on the compare prism. Must read against
     *  `bg.elevated`: light palettes need a dark ink, dark palettes a light one. */
    ringInk: string;
    /** Ring opacity with the pointer far away, 0-1. CSS interpolates from here
     *  to 1 as the pointer closes in; `chromeGlow.ts` only reports proximity. */
    ringFloor: string;
    shellShadow: string;
  };
  /** Optional syntax token overrides on the Pierre base theme. */
  syntax?: SyntaxRoles;
};

/** Syntax colors mapped to TextMate scopes in createShikiTheme. */
export type SyntaxRoles = {
  keyword: string;
  func: string;
  string: string;
  tag: string;
  entity: string;
  constant: string;
  operator?: string;
  comment?: string;
  markup?: string;
};

export type PierreBaseId = "pierre-dark" | "pierre-light";

export type ThemeDefinition = {
  id: ThemeId;
  scheme: ColorScheme;
  pierreThemeName: string;
  pierreBase: PierreBaseId;
  roles: ThemeRoles;
};
