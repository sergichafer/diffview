/** Ayu Light, adapted from Ayu. See THIRD_PARTY_NOTICES.md. */
import type { ThemeRoles } from "../types";

export const ayuLightRoles: ThemeRoles = {
  bg: {
    /** Diffs and file tree */
    editor: "#fcfcfc",
    /** Title bar / shelf */
    window: "#dcddde",
    /** Workspaces nav + settings segment track */
    inset: "#e2e3e4",
    /** Sheet + selected segment pill */
    elevated: "#f2f2f2",
  },
  fg: {
    /** AAA against window: title wordmark on the shelf. Also elevated/inset (settings). */
    base: "#41464a",
    /** AAA against window `#dcddde`: stroke caption buttons rest on the shelf. */
    muted: "#3c4656",
    /** AAA against editor: diffs modified ink. */
    accent: "#53585d",
    /** AAA against elevated: icon buttons / settings headings. */
    accentBright: "#4a4f53",
  },
  /** Solid greys: variant for default/seam, stronger for strong/seamStrong. */
  border: {
    default: "#dfe0e1",
    strong: "#cfd1d2",
    /** common.accent: 1.4.11 non-text 3:1 on editor, elevated, and window (caption focus). */
    focus: "#b46d00",
    /** 1× seam: section hairlines; not a 1.4.11 boundary. */
    seam: "#dfe0e1",
    /** 2× seam: card stroke (same hex as `border.strong`). */
    seamStrong: "#cfd1d2",
    /** Catch-light: faint black on light elevated sheets. */
    highlight: "rgba(0, 0, 0, 0.05)",
  },
  accent: {
    /** common.accent: 1.4.11 non-text 3:1 on elevated and window. */
    primary: "#b46d00",
    subtle: "rgba(242, 151, 24, 0.12)",
    contrastOnAccent: "#804b00",
  },
  states: {
    /** Official vcs tints, AAA-tuned for ink and row washes */
    success: "#2a6400",
    danger: "#a71f3c",
    modified: "#105998",
    merge: "#6d4593",
    warn: "#784f00",
    info: "#005f78",
  },
  list: {
    activeSelectionBg: "rgba(107, 125, 143, 0.14)",
    /** AAA against selection tint composited over editor (not raw bg.editor). */
    activeSelectionFg: "#494d52",
    inactiveSelectionBg: "rgba(107, 125, 143, 0.12)",
    hoverBg: "rgba(107, 125, 143, 0.14)",
    scrollbar: "rgba(130, 142, 159, 0.4)",
  },
  effects: {
    /** common.accent, AAA-tuned; lockstep with `accent.primary`. */
    ringInk: "#b46d00",
    /** Highest floor of the four: mid-tone gold on near-white needs it to reach
     *  the ~2:1 resting arc the other three get for free. */
    ringFloor: "0.68",
    /** ui.panel.shadow: cool, no white gloss inset. */
    shellShadow: "0 24px 60px rgba(107, 125, 143, 0.07)",
  },
  syntax: {
    keyword: "#933d00",
    func: "#784f00",
    string: "#465f00",
    tag: "#005f78",
    entity: "#005b91",
    constant: "#6d4593",
    operator: "#913f0b",
    comment: "#56575a",
    markup: "#a32932",
  },
};
