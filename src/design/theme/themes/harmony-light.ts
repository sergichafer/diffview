import type { ThemeRoles } from "../types";

export const harmonyLightRoles: ThemeRoles = {
  bg: {
    editor: "#ffffff",
    window: "#eceef2",
    inset: "#e4e6eb",
    elevated: "#f4f6f9",
  },
  fg: {
    base: "#18181c",
    /** AAA against inset: workspaces nav (and settings nav) sit on --bg-inset.
     *  Still AAA on window, where `.workspace.is-loading` paints muted on the shelf. */
    muted: "#474a53",
    accent: "#52565e",
    accentBright: "#2e3138",
  },
  /** Borders derive from one neutral (#585c64) on an alpha ramp. */
  border: {
    default: "rgba(88, 92, 100, 0.14)",
    strong: "rgba(88, 92, 100, 0.30)",
    /** Solid. A 22% alpha ring is ~1.1:1 and fails 1.4.11. 6.70:1 on editor. */
    focus: "#585c64",
    /** 1× seam (10%): section hairlines; not a 1.4.11 boundary. */
    seam: "rgba(88, 92, 100, 0.1)",
    /** 2× seam (20%): Panels card stroke; distinct from border.strong. */
    seamStrong: "rgba(88, 92, 100, 0.2)",
    /** Catch-light: faint black on light elevated sheets. */
    highlight: "rgba(0, 0, 0, 0.05)",
  },
  accent: {
    primary: "#2e3138",
    subtle: "rgba(82, 86, 94, 0.1)",
    contrastOnAccent: "#ffffff",
  },
  states: {
    /** Pierre / Harmony official tints, AAA-tuned for ink */
    success: "#006739",
    danger: "#ad1f25",
    modified: "#1854b7",
    merge: "#6f3bb7",
    warn: "#775200",
    info: "#00626f",
  },
  list: {
    activeSelectionBg: "rgba(82, 86, 94, 0.08)",
    activeSelectionFg: "#484c56",
    inactiveSelectionBg: "rgba(82, 86, 94, 0.05)",
    hoverBg: "rgba(0, 0, 0, 0.03)",
    scrollbar: "rgba(88, 92, 100, 0.22)",
  },
  effects: {
    /** Dark ink: the old white-on-black sweep vanished on a white prism. */
    ringInk: "#585c64",
    ringFloor: "0.55",
    shellShadow:
      "0 24px 60px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(0, 0, 0, 0.05)",
  },
  /** Pierre light syntax, AAA-tuned over the base via syntaxTokenColors(). */
  syntax: {
    keyword: "#b2004b",
    func: "#6737cc",
    string: "#006725",
    tag: "#a82900",
    entity: "#9419ac",
    constant: "#00617b",
    operator: "#595959",
    comment: "#595959",
    markup: "#8c4600",
  },
};
