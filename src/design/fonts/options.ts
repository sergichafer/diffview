import type { CodeFontId, FontOption, UiFontId } from "./types";

export const UI_FONT_OPTIONS: readonly FontOption<UiFontId>[] = [
  {
    value: "inter",
    label: "Inter",
    description: "Default UI type",
  },
  {
    value: "system",
    label: "System",
    description: "OS UI font stack",
  },
  {
    value: "syne",
    label: "Syne",
    description: "Bold geometric display sans",
  },
  {
    value: "ibm-plex-sans",
    label: "IBM Plex Sans",
    description: "Slightly industrial sans",
  },
  {
    value: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    description: "Soft geometric sans",
  },
];

export const CODE_FONT_OPTIONS: readonly FontOption<CodeFontId>[] = [
  {
    value: "system",
    label: "System",
    description: "OS monospace stack",
  },
  {
    value: "jetbrains-mono",
    label: "JetBrains Mono",
    description: "Clear coding face",
  },
  {
    value: "ibm-plex-mono",
    label: "IBM Plex Mono",
    description: "Matches Plex Sans",
  },
  {
    value: "source-code-pro",
    label: "Source Code Pro",
    description: "Adobe’s classic mono",
  },
];
