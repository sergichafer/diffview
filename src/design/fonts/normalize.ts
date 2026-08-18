import {
  CODE_FONT_IDS,
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  UI_FONT_IDS,
  type CodeFontId,
  type UiFontId,
} from "./types";

export { DEFAULT_CODE_FONT, DEFAULT_UI_FONT };

const UI_FONT_SET = new Set<string>(UI_FONT_IDS);
const CODE_FONT_SET = new Set<string>(CODE_FONT_IDS);

export function normalizeUiFont(value: unknown): UiFontId {
  if (typeof value === "string" && UI_FONT_SET.has(value)) {
    return value as UiFontId;
  }
  return DEFAULT_UI_FONT;
}

export function normalizeCodeFont(value: unknown): CodeFontId {
  if (typeof value === "string" && CODE_FONT_SET.has(value)) {
    return value as CodeFontId;
  }
  return DEFAULT_CODE_FONT;
}
