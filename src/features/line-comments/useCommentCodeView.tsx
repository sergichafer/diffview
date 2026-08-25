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
  annotationAnchor,
  buildExportPrompt,
  type CommentMeta,
  type PathComments,
} from "./commentMeta";
import { captureCommentSnippet } from "./extractSnippet";
import type { LineCommentsValue } from "./LineCommentsProvider";

/** Room under the last file so the chip does not cover hunks. */
export const COPY_PROMPT_PANEL_PADDING = 80;

type CommentPin = {
  path: string;
  side: "additions" | "deletions";
  lineNumber: number;
};

type SelectionState = {
  key: string | null;
  /** Slot whose range stays selected while that comment exists. */
  pin: CommentPin | null;
  lines: CodeViewLineSelection | null;
};

export type CommentCodeViewBindings = {
  selectedLines: CodeViewLineSelection | null;
  onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
  enableLineSelection: boolean;
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

function pinFromRange(
  path: string,
  range: SelectedLineRange,
): CommentPin | null {
  const anchor = annotationAnchor(range);
  if (anchor == null) return null;
  return { path, side: anchor.side, lineNumber: anchor.lineNumber };
}

function selectionFromPin(
  pin: CommentPin | null,
  pathComments: PathComments,
): CodeViewLineSelection | null {
  if (pin == null) return null;
  const annotation = pathComments[pin.path]?.find(
    (row) => row.side === pin.side && row.lineNumber === pin.lineNumber,
  );
  if (annotation == null) return null;
  return { id: pin.path, range: annotation.metadata.range };
}

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
    pin: null,
    lines: null,
  });
  const pinnedLines = selectionFromPin(selection.pin, pathComments);
  if (selection.key !== activeKey) {
    setSelection({ key: activeKey, pin: null, lines: null });
  } else if (selection.pin != null && pinnedLines == null) {
    setSelection({ key: activeKey, pin: null, lines: null });
  }

  const selectedLines =
    selection.key !== activeKey
      ? null
      : (pinnedLines ?? (selection.pin != null ? null : selection.lines));

  const onSelectedLinesChange = useCallback(
    (lines: CodeViewLineSelection | null) => {
      setSelection((prev) => {
        if (
          prev.key === activeKey &&
          selectionFromPin(prev.pin, pathComments) != null
        ) {
          return prev;
        }
        return { key: activeKey, pin: null, lines };
      });
    },
    [activeKey, pathComments],
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

  const pinComment = useCallback(
    (path: string, range: SelectedLineRange) => {
      const pin = pinFromRange(path, range);
      if (pin == null) return;
      setSelection({ key: activeKey, pin, lines: null });
    },
    [activeKey],
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
          }}
          onEdit={() => beginEdit(path, key)}
          onSelectRange={() => pinComment(path, annotation.metadata.range)}
        />
      );
    },
    [beginEdit, deleteComment, handleSave, pinComment],
  );

  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange, context: { item: CodeViewItem<CommentMeta> }) => {
      if (context.item.type !== "diff") return;
      if (editingPaths.has(context.item.id)) return;
      startDraft(context.item.id, range);
      pinComment(context.item.id, range);
    },
    [editingPaths, pinComment, startDraft],
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
    enableLineSelection: pinnedLines == null,
    renderAnnotation,
    onGutterUtilityClick,
    panelPaddingBottom: hasSaved ? COPY_PROMPT_PANEL_PADDING : 0,
    chip: hasSaved ? <CopyReviewPrompt prompt={exportPrompt} /> : null,
  };
}
