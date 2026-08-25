import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { CodeViewLineSelection, SelectedLineRange } from "@pierre/diffs";
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewItem,
  type CodeViewReactOptions,
} from "@pierre/diffs/react";
import {
  diffLayoutUnsafeCss,
  getPierreThemePair,
} from "@/design/theme";
import { DiffHeaderActions } from "@/features/diff-workspace/DiffHeaderActions";
import { collapseItemVersion } from "@/features/diff-workspace/useDiffWorkspace";
import type { CodeFontId, DiffStyle, ThemeId, UiFontId } from "@/shared/types/app";
import { CommentCard } from "./CommentCard";
import {
  buildExportPrompt,
  languageFromPath,
  makeAnnotation,
  savedCommentCount,
  type CommentMeta,
  type PathComments,
} from "./commentMeta";
import { ExportControl, type ExportShape } from "./ExportControl";
import {
  buildFixtureItems,
  PANEL_PATH,
  PANEL_RANGE,
  REVIEW_REPO,
  seedComments,
} from "./fixture";
import type { RestingCopy } from "./restingLabel";

function addPath(prev: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(prev);
  next.add(path);
  return next;
}

function removePath(prev: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(prev);
  next.delete(path);
  return next;
}

export interface ReviewCodePaneProps {
  card: "saved" | "draft";
  shape: ExportShape;
  copy: RestingCopy;
  diffStyle: DiffStyle;
  themeMode: "light" | "dark";
  themeId: ThemeId;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  onSelectedPath: (path: string) => void;
  codeViewRef: RefObject<CodeViewHandle<CommentMeta> | null>;
}

export function ReviewCodePane({
  card,
  shape,
  copy,
  diffStyle,
  themeMode,
  themeId,
  uiFont,
  codeFont,
  onSelectedPath,
  codeViewRef,
}: ReviewCodePaneProps) {
  const [comments, setComments] = useState<PathComments>(() =>
    seedComments(card),
  );
  const [notesRev, setNotesRev] = useState(0);
  const [viewedPaths, setViewedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedWhileViewed, setExpandedWhileViewed] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [editingPaths, setEditingPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedLines, setSelectedLines] =
    useState<CodeViewLineSelection | null>({
      id: PANEL_PATH,
      range: PANEL_RANGE,
    });

  useEffect(() => {
    setComments(seedComments(card));
    setNotesRev((n) => n + 1);
    setSelectedLines({ id: PANEL_PATH, range: PANEL_RANGE });
  }, [card]);

  const baseItems = useMemo(() => buildFixtureItems({}), []);

  const displayItems = useMemo(
    () =>
      baseItems.map((item) => {
        const collapseVersion = collapseItemVersion(
          item.id,
          viewedPaths,
          expandedWhileViewed,
        );
        const collapsed = collapseVersion === 1;
        const edit = editingPaths.has(item.id);
        return {
          ...item,
          annotations: comments[item.id] ?? [],
          collapsed,
          edit,
          version: collapseVersion * 10000 + (edit ? 1000 : 0) + notesRev,
        };
      }),
    [
      baseItems,
      comments,
      editingPaths,
      expandedWhileViewed,
      notesRev,
      viewedPaths,
    ],
  );

  const addDraft = useCallback(
    (itemId: string, range: SelectedLineRange) => {
      const annotation = makeAnnotation(range, {
        kind: "draft",
        key: `draft-${itemId}-${range.end}`,
        message: "",
        range,
        snippet: "",
        language: languageFromPath(itemId),
      });
      if (annotation == null) return;
      setComments((prev) => {
        const next: PathComments = {};
        for (const [path, list] of Object.entries(prev)) {
          next[path] = list.filter((row) => row.metadata.kind !== "draft");
        }
        next[itemId] = [...(next[itemId] ?? []), annotation];
        return next;
      });
      setNotesRev((n) => n + 1);
      setSelectedLines({ id: itemId, range });
      onSelectedPath(itemId);
    },
    [onSelectedPath],
  );

  const patchComment = useCallback(
    (
      itemId: string,
      key: string,
      patch: (meta: CommentMeta) => CommentMeta | null,
    ) => {
      setComments((prev) => {
        const list = prev[itemId] ?? [];
        const nextList = list.flatMap((row) => {
          if (row.metadata.key !== key) return [row];
          const meta = patch(row.metadata);
          if (meta == null) return [];
          const next = makeAnnotation(meta.range, meta);
          return next ? [next] : [];
        });
        return { ...prev, [itemId]: nextList };
      });
      setNotesRev((n) => n + 1);
    },
    [],
  );

  const renderAnnotation = useCallback(
    (
      annotation: { metadata: CommentMeta; side?: string },
      item: CodeViewItem<CommentMeta>,
    ) => {
      if (!("side" in annotation) || item.type !== "diff") return null;
      const meta = annotation.metadata;
      return (
        <div style={{ whiteSpace: "normal" }}>
          <CommentCard
            meta={meta}
            onSave={(message) =>
              patchComment(item.id, meta.key, (current) => ({
                ...current,
                kind: "saved",
                message,
              }))
            }
            onCancel={() => patchComment(item.id, meta.key, () => null)}
            onEdit={() =>
              patchComment(item.id, meta.key, (current) => ({
                ...current,
                kind: "draft",
              }))
            }
            onDelete={() => patchComment(item.id, meta.key, () => null)}
            onSelectRange={() =>
              setSelectedLines({ id: item.id, range: meta.range })
            }
          />
        </div>
      );
    },
    [patchComment],
  );

  const renderHeaderMetadata = useCallback(
    (item: CodeViewItem<CommentMeta>) => {
      if (item.type !== "diff") return null;
      const viewed = viewedPaths.has(item.id);
      const flipped = expandedWhileViewed.has(item.id);
      const diffCollapsed = viewed ? !flipped : flipped;
      return (
        <DiffHeaderActions
          repoPath={REVIEW_REPO.path}
          path={item.id}
          viewed={viewed}
          diffCollapsed={diffCollapsed}
          editable
          editAllowed
          editing={editingPaths.has(item.id)}
          onPreview={() => {}}
          onViewedChange={(path, viewedNext) => {
            setViewedPaths((prev) =>
              viewedNext ? addPath(prev, path) : removePath(prev, path),
            );
            setExpandedWhileViewed((prev) => removePath(prev, path));
          }}
          onToggleDiffCollapsed={(path) => {
            setExpandedWhileViewed((prev) =>
              prev.has(path) ? removePath(prev, path) : addPath(prev, path),
            );
          }}
          onStartEdit={(path) =>
            setEditingPaths((prev) => addPath(prev, path))
          }
          onSaveEdit={(path) =>
            setEditingPaths((prev) => removePath(prev, path))
          }
          onDiscardEdit={(path) =>
            setEditingPaths((prev) => removePath(prev, path))
          }
        />
      );
    },
    [editingPaths, expandedWhileViewed, viewedPaths],
  );

  const unsafeCSS = diffLayoutUnsafeCss(themeMode, themeId, uiFont, codeFont);

  const diffOptions = useMemo((): CodeViewReactOptions<CommentMeta> => {
    return {
      theme: getPierreThemePair(themeId),
      themeType: themeMode,
      diffStyle,
      stickyHeaders: true,
      layout: { paddingTop: 0, paddingBottom: 80, gap: 0 },
      itemMetrics: { paddingBottom: 0 },
      unsafeCSS,
      enableGutterUtility: true,
      enableLineSelection: true,
      onGutterUtilityClick(range, context) {
        if (context.item.type !== "diff") return;
        addDraft(context.item.id, range);
      },
    };
  }, [addDraft, diffStyle, themeId, themeMode, unsafeCSS]);

  const commentCount = savedCommentCount(comments);
  const payload = buildExportPrompt(comments);

  return (
    <section className="diff-panel branch-diff-panel review-diff">
      <CodeView
        ref={codeViewRef}
        items={displayItems}
        className="branch-code-view"
        options={diffOptions}
        selectedLines={selectedLines}
        onSelectedLinesChange={setSelectedLines}
        renderHeaderMetadata={renderHeaderMetadata}
        renderAnnotation={renderAnnotation}
      />
      {commentCount > 0 ? (
        <ExportControl
          shape={shape}
          copy={copy}
          commentCount={commentCount}
          payload={payload}
        />
      ) : null}
    </section>
  );
}
