import {
  isDiffAnnotation,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  type LineAnnotation,
  type SelectedLineRange,
} from "@pierre/diffs";
import type { CodeViewDiffItem, CodeViewItem } from "@pierre/diffs/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CommentCard } from "./CommentCard";
import { CopyReviewPrompt } from "./CopyReviewPrompt";
import {
  activeDraft,
  buildExportPrompt,
  findComment,
  type CommentMeta,
} from "./commentMeta";
import { captureCommentSnippet } from "./extractSnippet";
import type { LineCommentsValue } from "./LineCommentsProvider";

/** Room under the last file so the chip does not cover hunks. */
export const COPY_PROMPT_PANEL_PADDING = 80;

type SelectionState = {
  key: string | null;
  commentKey: string | null;
  lines: CodeViewLineSelection | null;
};

export type CommentCodeViewBindings = {
  selectedLines: CodeViewLineSelection | null;
  onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
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
    commentKey: null,
    lines: null,
  });
  const draft = activeDraft(pathComments);
  const focused = findComment(pathComments, selection.commentKey);
  if (selection.key !== activeKey) {
    setSelection({ key: activeKey, commentKey: null, lines: null });
  } else if (
    draft != null &&
    selection.commentKey !== draft.annotation.metadata.key
  ) {
    setSelection({
      key: activeKey,
      commentKey: draft.annotation.metadata.key,
      lines: null,
    });
  } else if (selection.commentKey != null && focused == null) {
    setSelection({ key: activeKey, commentKey: null, lines: null });
  }

  const locked =
    selection.key !== activeKey ? null : (draft ?? focused);
  const selectedLines =
    locked != null
      ? { id: locked.path, range: locked.annotation.metadata.range }
      : selection.key === activeKey
        ? selection.lines
        : null;
  const lockKey = locked?.annotation.metadata.key ?? null;

  const onSelectedLinesChange = useCallback(
    (lines: CodeViewLineSelection | null) => {
      if (lockKey != null) return;
      setSelection({ key: activeKey, commentKey: null, lines });
    },
    [activeKey, lockKey],
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
    },
    [displayItems, saveComment],
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
          onDiscard={() => deleteComment(path, key)}
          onEdit={() => beginEdit(path, key)}
          onSelectRange={() =>
            setSelection({ key: activeKey, commentKey: key, lines: null })
          }
        />
      );
    },
    [activeKey, beginEdit, deleteComment, handleSave],
  );

  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange, context: { item: CodeViewItem<CommentMeta> }) => {
      if (context.item.type !== "diff") return;
      if (editingPaths.has(context.item.id)) return;
      startDraft(context.item.id, range);
    },
    [editingPaths, startDraft],
  );

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
    renderAnnotation,
    onGutterUtilityClick,
    panelPaddingBottom: hasSaved ? COPY_PROMPT_PANEL_PADDING : 0,
    chip: hasSaved ? <CopyReviewPrompt prompt={exportPrompt} /> : null,
  };
}
