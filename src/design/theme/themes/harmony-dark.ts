import type { ThemeRoles } from "../types";

export const harmonyDarkRoles: ThemeRoles = {
  bg: {
    editor: "#111114",
    window: "#18181c",
    inset: "#0e0e12",
    elevated: "#1d1d22",
  },
  fg: {
    base: "#eceef2",
    /** AAA against elevated: hardest of editor / elevated / window (loading on shelf). */
    muted: "#a6a7b1",
    accent: "#b4b8c2",
    accentBright: "#e4e6ec",
  },
  /** Borders derive from one neutral (#b8bcc6) on an alpha ramp. */
  border: {
    default: "rgba(184, 188, 198, 0.12)",
    strong: "rgba(184, 188, 198, 0.26)",
    /** Solid. A 26% alpha ring is ~1.1:1 and fails 1.4.11. 9.90:1 on editor. */
    focus: "#b8bcc6",
    /** 1× seam (10%): section hairlines; not a 1.4.11 boundary. */
    seam: "rgba(184, 188, 198, 0.1)",
    /** 2× seam (20%): Panels card stroke; distinct from border.strong. */
    seamStrong: "rgba(184, 188, 198, 0.2)",
    /** Catch-light: faint white on dark elevated sheets. */
    highlight: "rgba(255, 255, 255, 0.05)",
  },
  accent: {
    primary: "#e4e6ec",
    subtle: "rgba(228, 230, 236, 0.12)",
    contrastOnAccent: "#111114",
  },
  states: {
    success: "#5fd99a",
    /** Official tint, AAA-tuned for ink */
    danger: "#ed7d7c",
    modified: "#7fb3ff",
    merge: "#c8a3ff",
    warn: "#e8c06a",
    info: "#5fcbd9",
  },
  list: {
    activeSelectionBg: "rgba(228, 230, 236, 0.06)",
    activeSelectionFg: "#e4e6ec",
    inactiveSelectionBg: "rgba(228, 230, 236, 0.04)",
    hoverBg: "rgba(255, 255, 255, 0.03)",
    scrollbar: "rgba(184, 188, 198, 0.22)",
  },
  effects: {
    ringInk: "#ffffff",
    ringFloor: "0.32",
    shellShadow:
      "0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  /** Pierre dark syntax; failing roles AAA-tuned, rest keep official chroma. */
  syntax: {
    keyword: "#ff6c90",
    func: "#ae89ff",
    string: "#5ecc71",
    tag: "#ff855e",
    entity: "#df71f4",
    constant: "#68cdf2",
    operator: "#9e9e9d",
    comment: "#9e9e9d",
    markup: "#ffa359",
  },
};
