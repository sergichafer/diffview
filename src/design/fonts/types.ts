export type UiFontId =
  | "inter"
  | "system"
  | "syne"
  | "ibm-plex-sans"
  | "plus-jakarta-sans";

export type CodeFontId =
  | "system"
  | "jetbrains-mono"
  | "ibm-plex-mono"
  | "source-code-pro"
  | "departure-mono";

export const UI_FONT_IDS = [
  "inter",
  "system",
  "syne",
  "ibm-plex-sans",
  "plus-jakarta-sans",
] as const satisfies readonly UiFontId[];

export const CODE_FONT_IDS = [
  "system",
  "jetbrains-mono",
  "ibm-plex-mono",
  "source-code-pro",
  "departure-mono",
] as const satisfies readonly CodeFontId[];

export const DEFAULT_UI_FONT: UiFontId = "inter";
export const DEFAULT_CODE_FONT: CodeFontId = "system";

export interface FontOption<T extends string> {
  value: T;
  label: string;
  description: string;
}
