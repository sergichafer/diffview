/** Catppuccin Mocha, adapted from Catppuccin. See THIRD_PARTY_NOTICES.md. */
import type { ThemeRoles } from "../types";

export const catppuccinDarkRoles: ThemeRoles = {
  bg: {
    editor: "#1e1e2e",
    window: "#181825",
    inset: "#11111b",
    elevated: "#313244",
  },
  fg: {
    base: "#cdd6f4",
    /** AAA against elevated: hardest of editor / elevated / window (loading on shelf). */
    muted: "#bbc1d5",
    /** AAA against editor: diffs modified ink. */
    accent: "#bac2de",
    accentBright: "#cdd6f4",
  },
  /** Borders derive from one Overlay 0 (#6c7086) on an alpha ramp. */
  border: {
    default: "rgba(108, 112, 134, 0.14)",
    strong: "rgba(108, 112, 134, 0.28)",
    /** Solid Lavender. An alpha ring fails 1.4.11. */
    focus: "#b4befe",
    /** 1× seam (10%): section hairlines; not a 1.4.11 boundary. */
    seam: "rgba(108, 112, 134, 0.1)",
    /** 2× seam (20%): Panels card stroke; distinct from border.strong. */
    seamStrong: "rgba(108, 112, 134, 0.2)",
    /** Catch-light: faint white on dark elevated sheets. */
    highlight: "rgba(255, 255, 255, 0.05)",
  },
  accent: {
    primary: "#cba6f7",
    subtle: "rgba(203, 166, 247, 0.12)",
    contrastOnAccent: "#1e1e2e",
  },
  states: {
    success: "#a6e3a1",
    /** Official Mocha red, AAA on editor. */
    danger: "#f38ba8",
    modified: "#89b4fa",
    merge: "#cba6f7",
    warn: "#f9e2af",
    info: "#94e2d5",
  },
  list: {
    activeSelectionBg: "rgba(147, 153, 178, 0.14)",
    activeSelectionFg: "#cdd6f4",
    inactiveSelectionBg: "rgba(147, 153, 178, 0.12)",
    hoverBg: "rgba(255, 255, 255, 0.03)",
    scrollbar: "rgba(108, 112, 134, 0.4)",
  },
  effects: {
    ringInk: "#cba6f7",
    ringFloor: "0.38",
    shellShadow:
      "0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  syntax: {
    keyword: "#cba6f7",
    func: "#89b4fa",
    string: "#a6e3a1",
    tag: "#eba0ac",
    entity: "#f9e2af",
    constant: "#fab387",
    operator: "#89dceb",
    /** AAA-tuned from Overlay 2 toward white for 7:1 on editor. */
    comment: "#a3a9be",
    markup: "#f5c2e7",
  },
};
