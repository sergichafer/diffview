import { describe, expect, mock, test } from "bun:test";
import { isReplaceableEditor, replaceEditorText } from "./replaceEditorText";

describe("replaceEditorText", () => {
  test("replaces the full buffer when it differs from baseline", () => {
    const applyEdits = mock(() => {});
    const ok = replaceEditorText(
      { getText: () => "edited\nline\n", applyEdits },
      "baseline\n",
    );
    expect(ok).toBe(true);
    expect(applyEdits).toHaveBeenCalledWith(
      [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 2, character: 0 },
          },
          newText: "baseline\n",
        },
      ],
      false,
    );
  });

  test("is a no-op when the buffer already matches", () => {
    const applyEdits = mock(() => {});
    expect(
      replaceEditorText({ getText: () => "same\n", applyEdits }, "same\n"),
    ).toBe(true);
    expect(applyEdits).not.toHaveBeenCalled();
  });

  test("returns false when the editor is missing", () => {
    expect(replaceEditorText(null, "x")).toBe(false);
  });

  test("narrows only objects that expose getText and applyEdits", () => {
    expect(isReplaceableEditor(null)).toBe(false);
    expect(isReplaceableEditor({})).toBe(false);
    expect(isReplaceableEditor({ getText: () => "" })).toBe(false);
    expect(
      isReplaceableEditor({ getText: () => "", applyEdits: () => {} }),
    ).toBe(true);
  });
});
