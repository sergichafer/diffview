import type { ThemeRoles } from "../types";

export interface DiffFontStacks {
  /** UI chrome inside the Pierre host (headers, separators, buttons). */
  ui: string;
  /** Code lines inside the Pierre host. */
  mono: string;
}

function commentLineHighlightCss(mix: string): string {
  return `
/* Comment ranges reuse Pierre's line and gutter slots, mixed with states.info. */
[data-comment-line]:not([data-selected-line]) {
  --mix-comment-light: 82%;
  --mix-comment-dark: 75%;
  --diffs-comment-mix-target: ${mix};
  --diffs-computed-selected-line-bg: light-dark(
    color-mix(in lab, var(--diffs-computed-diff-line-bg) var(--mix-comment-light), var(--diffs-comment-mix-target)),
    color-mix(in lab, var(--diffs-computed-diff-line-bg) var(--mix-comment-dark), var(--diffs-comment-mix-target))
  );
}

[data-gutter-buffer][data-comment-line]:not([data-selected-line]),
[data-column-number][data-comment-line]:not([data-selected-line]) {
  color: ${mix};
}
`;
}

/** Pierre diffs shadow DOM overrides, including comment-range color. Document
 *  CSS variables do not reach this host, so mix the info color here. */
export function buildDiffLayoutUnsafeCss(
  roles: Pick<ThemeRoles, "bg" | "fg" | "border" | "list" | "states">,
  fonts?: DiffFontStacks,
): string {
  const { bg, fg, border, list, states } = roles;
  // RISK: Pierre shadow DOM. Inject resolved values, not document CSS vars.
  // Light-DOM custom properties are unreliable here; unresolved border-color
  // falls back to currentColor and paints a dark line on every header.
  // Same for --scrollbar: document vars are invisible here, so interpolate
  // the reveal colour as a literal. Shadow-local custom properties are fine.
  const seam = border.seam;
  const scrollbar = list.scrollbar;
  // Upstream also paints header +/- counts and [data-error-wrapper] with the
  // code font; force those back to UI. Gutters stay mono (Pierre/lab default).
  const fontRules = fonts
    ? `
:host {
  --diffs-header-font-family: ${fonts.ui};
  --diffs-font-family: ${fonts.mono};
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count],
[data-error-wrapper] {
  font-family: var(--diffs-header-font-family);
}

[data-error-wrapper] [data-error-stack] {
  font-family: var(--diffs-font-family);
}
`
    : "";

  return `
${fontRules}
/* Between-file seam. NOT [data-file]+[data-file]: each CodeView item is its own
 * <diffs-container> shadow root, and this app renders type:"diff" (data-diff),
 * so file wrappers are never adjacent siblings inside one shadow tree. Hosts
 * are light-DOM siblings under CodeView's sticky container. */
:host(:not(:first-child)) {
  border-top: 1px solid ${seam};
}

/* Scrollbar. Pierre owns geometry and reveal-on-hover. Override only the
 * reveal colour: upstream paints the thumb with --diffs-bg-context, which we
 * repoint to bg.editor for context rows, so the thumb would reveal invisibly
 * against the surface it sits on. Literal because document --scrollbar is
 * not visible in this shadow tree. */
[data-diff]:hover [data-code]::-webkit-scrollbar-thumb,
[data-file]:hover [data-code]::-webkit-scrollbar-thumb {
  background-color: ${scrollbar};
}

[data-diffs-header],
[data-diffs-header][data-sticky],
[data-diffs-header=default] {
  position: relative;
  z-index: 10;
  isolation: isolate;
  overflow: visible;
  background-color: transparent;
  border: none;
  border-bottom: 1px solid ${seam};
  border-radius: 0;
  width: 100%;
  box-sizing: border-box;
}

[data-diffs-header]::before {
  content: "";
  position: absolute;
  inset: 0;
  background-color: ${bg.editor};
  z-index: -2;
  pointer-events: none;
}

[data-diffs-header]::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: ${bg.elevated};
  z-index: -1;
  pointer-events: none;
}

[data-diffs-header][data-sticky] {
  position: sticky;
  top: 0;
}

[data-diffs-header] ~ [data-diff],
[data-diffs-header] ~ [data-file] {
  position: relative;
  z-index: 0;
}

[data-separator=line-info],
[data-separator=line-info-basic],
[data-separator=metadata],
[data-separator=line-info] [data-separator-content],
[data-separator=line-info-basic] [data-separator-content],
[data-separator=metadata] [data-separator-wrapper],
[data-expand-button] {
  background-color: ${bg.editor};
  color: ${fg.muted};
}

[data-content] [data-separator-wrapper] {
  display: none !important;
}

[data-unmodified-lines] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-unified] [data-gutter] [data-separator=line-info] [data-separator-wrapper],
[data-unified] [data-gutter] [data-separator=line-info-basic] [data-separator-wrapper] {
  display: flex !important;
  grid-template-columns: none !important;
}

[data-unified] [data-gutter] [data-separator-content] {
  justify-content: flex-end;
  margin-inline-start: auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-align: end;
}

[data-diff-type=split][data-overflow=scroll] [data-additions] [data-gutter] [data-separator=line-info] [data-separator-wrapper],
[data-diff-type=split][data-overflow=scroll] [data-additions] [data-gutter] [data-separator=line-info-basic] [data-separator-wrapper] {
  display: flex !important;
  grid-template-columns: none !important;
}

[data-diff-type=split][data-overflow=scroll] [data-additions] [data-gutter] [data-separator-content] {
  display: flex !important;
  justify-content: flex-end;
  margin-inline-start: auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-align: end;
}

[data-diff-type=split][data-overflow=scroll] [data-deletions] [data-gutter] [data-separator-content] {
  display: none !important;
}

[data-diff-type=split][data-overflow=scroll] [data-deletions] [data-gutter] [data-separator=line-info] [data-separator-wrapper],
[data-diff-type=split][data-overflow=scroll] [data-deletions] [data-gutter] [data-separator=line-info-basic] [data-separator-wrapper] {
  display: flex !important;
  grid-template-columns: none !important;
}

[data-diff-type=split][data-overflow=wrap] [data-additions] [data-content] [data-separator-wrapper] {
  display: flex !important;
  grid-template-columns: none !important;
}

[data-diff-type=split][data-overflow=wrap] [data-additions] [data-content] [data-separator-content] {
  display: flex !important;
  justify-content: flex-end;
  margin-inline-start: auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-align: end;
}

[data-diff-type=split][data-overflow=wrap] [data-deletions] [data-gutter] [data-separator-content] {
  display: none !important;
}

${commentLineHighlightCss(states.info)}
`.trim();
}
