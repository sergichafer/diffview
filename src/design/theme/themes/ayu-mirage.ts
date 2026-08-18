/** Ayu Mirage, adapted from Ayu. See THIRD_PARTY_NOTICES.md. */
import type { ThemeRoles } from "../types";

export const ayuMirageRoles: ThemeRoles = {
  bg: {
    editor: "#242936",
    window: "#1f2430",
    inset: "#1a1f29",
    elevated: "#282e3b",
  },
  fg: {
    base: "#cccac2",
    /** AAA against elevated: hardest of editor / elevated / window (loading on shelf). */
    muted: "#b0bbce",
    /** AAA against editor: diffs modified ink. */
    accent: "#b8b4ab",
    accentBright: "#e8e5dc",
  },
  /** Borders derive from one neutral (#8a9199) on an alpha ramp. */
  border: {
    default: "rgba(138, 145, 153, 0.14)",
    strong: "rgba(138, 145, 153, 0.28)",
    /** Solid. A 28% alpha ring is ~1.2:1 and fails 1.4.11. 4.56:1 on editor. */
    focus: "#8a9199",
    /** 1× seam (10%): section hairlines; not a 1.4.11 boundary. */
    seam: "rgba(138, 145, 153, 0.1)",
    /** 2× seam (20%): Panels card stroke; distinct from border.strong. */
    seamStrong: "rgba(138, 145, 153, 0.2)",
    /** Catch-light: faint white on dark elevated sheets. */
    highlight: "rgba(255, 255, 255, 0.05)",
  },
  accent: {
    primary: "#ffcc66",
    subtle: "rgba(255, 204, 102, 0.12)",
    contrastOnAccent: "#805500",
  },
  states: {
    success: "#87d96c",
    /** Official vcs.removed, AAA-tuned for ink */
    danger: "#ff979d",
    modified: "#80bfff",
    merge: "#d4bfff",
    warn: "#ffd173",
    info: "#5ccfe6",
  },
  list: {
    activeSelectionBg: "rgba(99, 117, 153, 0.15)",
    activeSelectionFg: "#e8e5dc",
    inactiveSelectionBg: "rgba(105, 117, 140, 0.12)",
    hoverBg: "rgba(255, 255, 255, 0.03)",
    scrollbar: "rgba(138, 145, 153, 0.4)",
  },
  effects: {
    ringInk: "#ffcc66",
    ringFloor: "0.38",
    shellShadow:
      "0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  syntax: {
    keyword: "#ffad66",
    func: "#ffd173",
    string: "#d5ff80",
    tag: "#5ccfe6",
    entity: "#73d0ff",
    constant: "#dfbfff",
    operator: "#f4a075",
    comment: "#a7b6c9",
    markup: "#ff998b",
  },
};
