import type { Editor } from "@pierre/diffs/edit";

export type ReplaceableEditor = Pick<Editor<undefined>, "getText" | "applyEdits">;

export function isReplaceableEditor(
  editor: object | null | undefined,
): editor is ReplaceableEditor {
  if (editor == null) return false;
  return (
    "getText" in editor &&
    "applyEdits" in editor &&
    typeof editor.getText === "function" &&
    typeof editor.applyEdits === "function"
  );
}

/**
 * Restore the in-memory buffer to the last hydrated/saved baseline before
 * the session ends (pairs with skipFlushOnce).
 */
export function replaceEditorText(
  editor: ReplaceableEditor | null | undefined,
  next: string,
): boolean {
  if (editor == null) return false;
  const current = editor.getText();
  if (current === next) return true;
  const lines = current.split("\n");
  const endLine = Math.max(0, lines.length - 1);
  const endCharacter = lines[endLine]?.length ?? 0;
  editor.applyEdits(
    [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: endLine, character: endCharacter },
        },
        newText: next,
      },
    ],
    false,
  );
  return true;
}
