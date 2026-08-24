/** Catppuccin Latte, adapted from Catppuccin. See THIRD_PARTY_NOTICES.md. */
import type { ThemeRoles } from "../types";

export const catppuccinLightRoles: ThemeRoles = {
  bg: {
    /** Diffs and file tree */
    editor: "#eff1f5",
    /** Title bar / shelf */
    window: "#e6e9ef",
    /** Workspaces nav + settings segment track */
    inset: "#dce0e8",
    /** Sheet + selected segment pill */
    elevated: "#ccd0da",
  },
  fg: {
    /** AAA-tuned from Text. Hits 7:1 on editor, elevated, inset, and window (title wordmark on the shelf). */
    base: "#3a3c50",
    /** AAA-tuned from Subtext 0. Same four surfaces (caption buttons rest on the shelf). */
    muted: "#3b3c48",
    /** AAA-tuned from Subtext 1. AAA against editor: diffs modified ink. */
    accent: "#4d5064",
    /** AAA-tuned from Text. AAA against editor and elevated (icon buttons / settings headings). */
    accentBright: "#3a3c50",
  },
  /** Solid greys: Surface 1 for default/seam, Surface 2 for strong/seamStrong. */
  border: {
    default: "#bcc0cc",
    strong: "#acb0be",
    /** Official Mauve. 1.4.11 ≥3:1 on editor, elevated, and window. Lockstep with accent.primary. Official Lavender fails 3:1. */
    focus: "#8839ef",
    /** 1× seam: section hairlines; not a 1.4.11 boundary. */
    seam: "#bcc0cc",
    /** 2× seam: card stroke (same hex as `border.strong`). */
    seamStrong: "#acb0be",
    /** Catch-light: faint black on light elevated sheets. */
    highlight: "rgba(0, 0, 0, 0.05)",
  },
  accent: {
    /** Official Mauve. 1.4.11 non-text 3:1 on editor, elevated, and window. */
    primary: "#8839ef",
    subtle: "rgba(136, 57, 239, 0.12)",
    contrastOnAccent: "#eff1f5",
  },
  states: {
    /** Official Latte tints, AAA-tuned for ink and row washes */
    success: "#255c19",
    danger: "#a30c2c",
    modified: "#164ab1",
    merge: "#682cb8",
    warn: "#72480f",
    info: "#0e5a5f",
  },
  list: {
    activeSelectionBg: "rgba(124, 127, 147, 0.14)",
    /** AAA against selection tint composited over editor (not raw bg.editor). */
    activeSelectionFg: "#3a3c50",
    inactiveSelectionBg: "rgba(124, 127, 147, 0.12)",
    hoverBg: "rgba(124, 127, 147, 0.14)",
    scrollbar: "rgba(124, 127, 147, 0.4)",
  },
  effects: {
    /** Official Mauve; lockstep with `accent.primary`. */
    ringInk: "#8839ef",
    /** Mid-chroma mauve on near-white. */
    ringFloor: "0.60",
    /** Cool overlay, no white gloss inset. */
    shellShadow: "0 24px 60px rgba(108, 111, 133, 0.07)",
  },
  /** Official Latte syntax, AAA-tuned toward black for 7:1 on editor. */
  syntax: {
    keyword: "#682cb8",
    func: "#164ab1",
    string: "#255c19",
    tag: "#932c35",
    entity: "#72480f",
    constant: "#8b3706",
    operator: "#025779",
    comment: "#4f505d",
    markup: "#783c68",
  },
};
