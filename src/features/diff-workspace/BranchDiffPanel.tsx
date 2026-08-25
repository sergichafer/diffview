import type {
  CodeViewLineSelection,
  DiffLineAnnotation,
  LineAnnotation,
} from "@pierre/diffs";
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewDiffItem,
  type CodeViewItem,
  type CodeViewReactOptions,
} from "@pierre/diffs/react";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  diffLayoutUnsafeCss,
  getPierreThemePair,
} from "@/design/theme";
import { useDiffEdit } from "@/features/diff-edit/useDiffEdit";
import { useDiffReview } from "@/features/diff-review/DiffReviewProvider";
import { CommentCard } from "@/features/line-comments/CommentCard";
import { CopyReviewPrompt } from "@/features/line-comments/CopyReviewPrompt";
import {
  buildExportPrompt,
  languageFromPath,
  type CommentMeta,
} from "@/features/line-comments/commentMeta";
import { extractSnippet } from "@/features/line-comments/extractSnippet";
import { useLineComments } from "@/features/line-comments/LineCommentsProvider";
import type { CodeFontId, DiffStyle, ThemeId, UiFontId } from "@/shared/types/app";
import { useRepoSession } from "@/features/repo-session/context";
import { useDiffItemHeader } from "./DiffItemHeader";

interface BranchDiffPanelProps {
  codeViewRef: RefObject<CodeViewHandle<CommentMeta> | null>;
  displayItems: CodeViewDiffItem<CommentMeta>[];
  itemCount: number;
  setPanelRef: (node: HTMLElement | null) => void;
  onScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<CommentMeta>["getInstance"]>>,
  ) => void;
  /** Live working tree only; ref-to-ref must not activate edit. */
  editAllowed: boolean;
  editablePaths: ReadonlySet<string>;
  editingPaths: ReadonlySet<string>;
  onStartEdit: (path: string) => void;
  onEndEdit: (path: string) => void;
  diffStyle: DiffStyle;
  themeMode: "light" | "dark";
  themeId: ThemeId;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  onPreview: (path: string) => void;
}

export function BranchDiffPanel({
  codeViewRef,
  displayItems,
  itemCount,
  setPanelRef,
  onScroll,
  editAllowed,
  editablePaths,
  editingPaths,
  onStartEdit,
  onEndEdit,
  diffStyle,
  themeMode,
  themeId,
  uiFont,
  codeFont,
  onPreview,
}: BranchDiffPanelProps) {
  const {
    overview,
    branchLoading,
    branchError,
    repo,
    baseBranch,
    headBranch,
    refreshOverviewMeta,
    activeKey,
  } = useRepoSession();
  const {
    viewedPaths,
    expandedWhileViewed,
    handleViewedChange,
    handleToggleDiffCollapsed,
  } = useDiffReview();
  const {
    savedCommentCount,
    startDraft,
    saveComment,
    beginEdit,
    deleteComment,
    pathComments,
  } = useLineComments();
  const [selectedLines, setSelectedLines] =
    useState<CodeViewLineSelection | null>(null);

  useEffect(() => {
    setSelectedLines(null);
  }, [activeKey]);

  const onSavedLive = useCallback(() => {
    void refreshOverviewMeta();
  }, [refreshOverviewMeta]);

  const {
    getSaveState,
    subscribeSaveState,
    loadDiffFiles,
    onItemEditChange,
    onItemEditComplete,
    retrySave,
    saveEdit,
    discardEdit,
  } = useDiffEdit({
    repoPath: repo?.path ?? null,
    baseBranch,
    headBranch,
    isLive: editAllowed,
    onSavedLive,
  });

  const files = overview?.files ?? [];
  const loading = branchLoading && itemCount === 0;

  const handleSaveEdit = useCallback(
    (path: string) => {
      void saveEdit(path).then((ok) => {
        if (ok) onEndEdit(path);
      });
    },
    [onEndEdit, saveEdit],
  );

  const handleDiscardEdit = useCallback(
    (path: string) => {
      discardEdit(path, codeViewRef.current?.getEditor(path));
      onEndEdit(path);
    },
    [codeViewRef, discardEdit, onEndEdit],
  );

  const renderHeaderMetadata = useDiffItemHeader({
    repoPath: repo?.path ?? "",
    viewedPaths,
    expandedWhileViewed,
    editablePaths,
    editingPaths,
    editAllowed,
    getSaveState,
    subscribeSaveState,
    onPreview,
    onViewedChange: handleViewedChange,
    onToggleDiffCollapsed: handleToggleDiffCollapsed,
    onStartEdit,
    onSaveEdit: handleSaveEdit,
    onDiscardEdit: handleDiscardEdit,
    onRetrySave: retrySave,
  });

  const handleSaveComment = useCallback(
    (path: string, key: string, message: string) => {
      const item = displayItems.find((row) => row.id === path);
      if (item == null || item.type !== "diff") return;
      const annotation = item.annotations?.find(
        (row) => row.metadata.key === key,
      );
      if (annotation == null) return;
      const range = annotation.metadata.range;
      const snippet = extractSnippet(
        item.fileDiff,
        annotation.side,
        range.start,
        range.end,
      );
      const language = item.fileDiff.lang || languageFromPath(item.id);
      saveComment(path, key, message, snippet, language);
      setSelectedLines(null);
    },
    [displayItems, saveComment],
  );

  const handleDiscardComment = useCallback(
    (path: string, key: string) => {
      deleteComment(path, key);
      setSelectedLines(null);
    },
    [deleteComment],
  );

  const handleEditComment = useCallback(
    (path: string, key: string) => {
      beginEdit(path, key);
    },
    [beginEdit],
  );

  const handleSelectRange = useCallback(
    (path: string, annotation: DiffLineAnnotation<CommentMeta>) => {
      setSelectedLines({ id: path, range: annotation.metadata.range });
    },
    [],
  );

  const renderAnnotation = useCallback(
    (
      annotation: LineAnnotation<CommentMeta> | DiffLineAnnotation<CommentMeta>,
      item: CodeViewItem<CommentMeta>,
    ) => {
      if (!("side" in annotation) || item.type !== "diff") return null;
      return (
        <div style={{ whiteSpace: "normal" }}>
          <CommentCard
            annotation={annotation}
            path={item.id}
            onSave={handleSaveComment}
            onDiscard={handleDiscardComment}
            onEdit={handleEditComment}
            onSelectRange={handleSelectRange}
          />
        </div>
      );
    },
    [
      handleDiscardComment,
      handleEditComment,
      handleSaveComment,
      handleSelectRange,
    ],
  );

  const unsafeCSS = diffLayoutUnsafeCss(themeMode, themeId, uiFont, codeFont);

  const diffOptions = useMemo((): CodeViewReactOptions<CommentMeta> => {
    return {
      theme: getPierreThemePair(themeId),
      themeType: themeMode,
      diffStyle,
      stickyHeaders: true,
      /** Files sit flush; the 1px seam between them is the only separator. */
      layout: {
        paddingTop: 0,
        paddingBottom: savedCommentCount > 0 ? 80 : 0,
        gap: 0,
      },
      itemMetrics: { paddingBottom: 0 },
      unsafeCSS,
      loadDiffFiles,
      enableGutterUtility: true,
      enableLineSelection: true,
      onGutterUtilityClick(range, context) {
        if (context.item.type !== "diff") return;
        if (editingPaths.has(context.item.id)) return;
        startDraft(context.item.id, range);
      },
    };
  }, [
    themeMode,
    themeId,
    diffStyle,
    unsafeCSS,
    loadDiffFiles,
    savedCommentCount,
    editingPaths,
    startDraft,
  ]);

  const exportPrompt = useMemo(
    () =>
      buildExportPrompt(
        displayItems.map((item) => item.id),
        pathComments,
      ),
    [displayItems, pathComments],
  );

  const skippedCount = files.length - itemCount;

  if (loading) {
    return (
      <p className="diff-panel is-empty" aria-live="polite">
        Loading diffs…
      </p>
    );
  }

  if (branchError) {
    return (
      <p className="diff-panel is-empty is-error" aria-live="assertive">
        <span aria-hidden="true">⚠ </span>
        Error: {branchError}
      </p>
    );
  }

  if (files.length === 0) {
    return (
      <div className="diff-panel is-empty">No changed files on this branch.</div>
    );
  }

  if (itemCount === 0) {
    return (
      <div className="diff-panel is-empty">
        The changed files could not be drawn.
      </div>
    );
  }

  return (
    <section ref={setPanelRef} className="diff-panel branch-diff-panel">
      {skippedCount > 0 && (
        <p className="diff-panel-hint">
          Showing {itemCount} of {files.length} changed files.
        </p>
      )}
      <CodeView<CommentMeta>
        ref={codeViewRef}
        items={displayItems}
        className="branch-code-view"
        options={diffOptions}
        onScroll={onScroll}
        selectedLines={selectedLines}
        onSelectedLinesChange={setSelectedLines}
        renderHeaderMetadata={renderHeaderMetadata}
        renderAnnotation={renderAnnotation}
        onItemEditChange={onItemEditChange}
        onItemEditComplete={onItemEditComplete}
      />
      {savedCommentCount > 0 ? <CopyReviewPrompt prompt={exportPrompt} /> : null}
    </section>
  );
}
