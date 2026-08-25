import {
  CodeView,
  type CodeViewHandle,
  type CodeViewDiffItem,
  type CodeViewReactOptions,
} from "@pierre/diffs/react";
import { useCallback, useMemo, type RefObject } from "react";
import {
  diffLayoutUnsafeCss,
  getPierreThemePair,
} from "@/design/theme";
import { useDiffEdit } from "@/features/diff-edit/useDiffEdit";
import { useDiffReview } from "@/features/diff-review/DiffReviewProvider";
import { useCommentCodeView } from "@/features/line-comments/useCommentCodeView";
import { useLineComments } from "@/features/line-comments/LineCommentsProvider";
import type { CommentMeta } from "@/features/line-comments/commentMeta";
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
  const comments = useLineComments();
  const commentView = useCommentCodeView({
    comments,
    displayItems,
    editingPaths,
    activeKey,
  });

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
  } = useDiffEdit<CommentMeta>({
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

  const renderHeaderMetadata = useDiffItemHeader<CommentMeta>({
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
        paddingBottom: commentView.panelPaddingBottom,
        gap: 0,
      },
      itemMetrics: { paddingBottom: 0 },
      unsafeCSS,
      loadDiffFiles,
      enableGutterUtility: true,
      enableLineSelection: true,
      onGutterUtilityClick: commentView.onGutterUtilityClick,
      onPostRender: commentView.onPostRender,
    };
  }, [
    themeMode,
    themeId,
    diffStyle,
    unsafeCSS,
    loadDiffFiles,
    commentView.panelPaddingBottom,
    commentView.onGutterUtilityClick,
    commentView.onPostRender,
  ]);

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
        selectedLines={commentView.selectedLines}
        onSelectedLinesChange={commentView.onSelectedLinesChange}
        renderHeaderMetadata={renderHeaderMetadata}
        renderAnnotation={commentView.renderAnnotation}
        onItemEditChange={onItemEditChange}
        onItemEditComplete={onItemEditComplete}
      />
      {commentView.chip}
    </section>
  );
}
