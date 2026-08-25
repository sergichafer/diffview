import {
  FileDiff,
  areSelectionsEqual,
  isDiffAnnotation,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  type LineAnnotation,
  type SelectedLineRange,
} from "@pierre/diffs";
import type {
  CodeViewDiffItem,
  CodeViewItem,
  CodeViewReactOptions,
} from "@pierre/diffs/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CommentCard } from "./CommentCard";
import { CopyReviewPrompt } from "./CopyReviewPrompt";
import { buildExportPrompt, type CommentMeta } from "./commentMeta";
import { paintCommentLines } from "./commentLineHighlight";
import { captureCommentSnippet } from "./extractSnippet";
import type { LineCommentsValue } from "./LineCommentsProvider";

/** Room under the last file so the chip does not cover hunks. */
export const COPY_PROMPT_PANEL_PADDING = 80;

type SelectionState = {
  key: string | null;
  lines: CodeViewLineSelection | null;
};

export type CommentCodeViewBindings = {
  selectedLines: CodeViewLineSelection | null;
  onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
  onPostRender: NonNullable<CodeViewReactOptions<CommentMeta>["onPostRender"]>;
  renderAnnotation: (
    annotation: LineAnnotation<CommentMeta> | DiffLineAnnotation<CommentMeta>,
    item: CodeViewItem<CommentMeta>,
  ) => ReactNode;
  onGutterUtilityClick: (
    range: SelectedLineRange,
    context: { item: CodeViewItem<CommentMeta> },
  ) => void;
  panelPaddingBottom: number;
  chip: ReactNode;
};

export function useCommentCodeView({
  comments,
  displayItems,
  editingPaths,
  activeKey,
}: {
  comments: LineCommentsValue;
  displayItems: readonly CodeViewDiffItem<CommentMeta>[];
  editingPaths: ReadonlySet<string>;
  activeKey: string | null;
}): CommentCodeViewBindings {
  const {
    saveComment,
    deleteComment,
    beginEdit,
    startDraft,
    pathComments,
    savedCommentCount,
  } = comments;

  const [selection, setSelection] = useState<SelectionState>({
    key: activeKey,
    lines: null,
  });
  if (selection.key !== activeKey) {
    setSelection({ key: activeKey, lines: null });
  }

  const selectedLines =
    selection.key === activeKey ? selection.lines : null;

  const onSelectedLinesChange = useCallback(
    (lines: CodeViewLineSelection | null) => {
      setSelection({ key: activeKey, lines });
    },
    [activeKey],
  );

  const releaseMatchingSelection = useCallback(
    (path: string, range: SelectedLineRange) => {
      setSelection((prev) => {
        if (
          prev.key !== activeKey ||
          prev.lines == null ||
          prev.lines.id !== path ||
          !areSelectionsEqual(prev.lines.range, range)
        ) {
          return prev;
        }
        return { key: activeKey, lines: null };
      });
    },
    [activeKey],
  );

  const handleSave = useCallback(
    (
      path: string,
      annotation: DiffLineAnnotation<CommentMeta>,
      message: string,
    ) => {
      const item = displayItems.find((row) => row.id === path);
      if (item == null || item.type !== "diff") return;
      const captured = captureCommentSnippet(item.fileDiff, path, annotation);
      saveComment(
        path,
        annotation.metadata.key,
        message,
        captured.snippet,
        captured.language,
      );
      releaseMatchingSelection(path, annotation.metadata.range);
    },
    [displayItems, releaseMatchingSelection, saveComment],
  );

  const renderAnnotation = useCallback(
    (
      annotation: LineAnnotation<CommentMeta> | DiffLineAnnotation<CommentMeta>,
      item: CodeViewItem<CommentMeta>,
    ) => {
      if (!isDiffAnnotation(annotation) || item.type !== "diff") return null;
      const path = item.id;
      const key = annotation.metadata.key;
      return (
        <CommentCard
          annotation={annotation}
          onSave={(message) => handleSave(path, annotation, message)}
          onDiscard={() => {
            deleteComment(path, key);
            releaseMatchingSelection(path, annotation.metadata.range);
          }}
          onEdit={() => beginEdit(path, key)}
        />
      );
    },
    [beginEdit, deleteComment, handleSave, releaseMatchingSelection],
  );

  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange, context: { item: CodeViewItem<CommentMeta> }) => {
      if (context.item.type !== "diff") return;
      if (editingPaths.has(context.item.id)) return;
      startDraft(context.item.id, range);
    },
    [editingPaths, startDraft],
  );

  const onPostRender = useCallback<
    NonNullable<CodeViewReactOptions<CommentMeta>["onPostRender"]>
  >((node, instance, phase, context) => {
    if (phase === "unmount") return;
    if (!(instance instanceof FileDiff)) return;
    if (context.type !== "diff") return;
    paintCommentLines(
      node,
      instance.getLineIndex,
      (context.item.annotations ?? []).map((row) => row.metadata.range),
    );
  }, []);

  const itemOrder = useMemo(
    () => displayItems.map((item) => item.id),
    [displayItems],
  );
  const exportPrompt = useMemo(
    () => buildExportPrompt(itemOrder, pathComments),
    [itemOrder, pathComments],
  );

  const hasSaved = savedCommentCount > 0;

  return {
    selectedLines,
    onSelectedLinesChange,
    onPostRender,
    renderAnnotation,
    onGutterUtilityClick,
    panelPaddingBottom: hasSaved ? COPY_PROMPT_PANEL_PADDING : 0,
    chip: hasSaved ? <CopyReviewPrompt prompt={exportPrompt} /> : null,
  };
}
