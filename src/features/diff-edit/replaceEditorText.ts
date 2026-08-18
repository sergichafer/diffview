/**
 * Discard uses this to restore the in-memory buffer to the last hydrated/saved
 * baseline before the session ends (pairs with skipFlushOnce).
 */
export function replaceEditorText(
  editor: {
    getText?: () => string;
    applyEdits?: (
      edits: Array<{
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        newText: string;
      }>,
      updateHistory?: boolean,
    ) => void;
  } | null | undefined,
  next: string,
): boolean {
  if (editor == null || typeof editor.getText !== "function") return false;
  if (typeof editor.applyEdits !== "function") return false;
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
