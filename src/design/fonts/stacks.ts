import type { CodeFontId, UiFontId } from "./types";

const SYSTEM_UI_STACK =
  'system-ui, -apple-system, "Segoe UI", sans-serif';

const SYSTEM_MONO_STACK =
  'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

const UI_STACKS: Record<UiFontId, string> = {
  inter: `"Inter Variable", ${SYSTEM_UI_STACK}`,
  system: SYSTEM_UI_STACK,
  syne: `"Syne", ${SYSTEM_UI_STACK}`,
  "ibm-plex-sans": `"IBM Plex Sans", ${SYSTEM_UI_STACK}`,
  "plus-jakarta-sans": `"Plus Jakarta Sans", ${SYSTEM_UI_STACK}`,
};

const CODE_STACKS: Record<CodeFontId, string> = {
  system: SYSTEM_MONO_STACK,
  "jetbrains-mono": `"JetBrains Mono", ${SYSTEM_MONO_STACK}`,
  "ibm-plex-mono": `"IBM Plex Mono", ${SYSTEM_MONO_STACK}`,
  "source-code-pro": `"Source Code Pro", ${SYSTEM_MONO_STACK}`,
};

export function uiFontStack(id: UiFontId): string {
  return UI_STACKS[id];
}

export function codeFontStack(id: CodeFontId): string {
  return CODE_STACKS[id];
}
