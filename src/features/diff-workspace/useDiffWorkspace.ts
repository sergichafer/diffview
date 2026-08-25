import type { CodeViewHandle, CodeViewDiffItem } from "@pierre/diffs/react";
import type { WorkerPoolManager } from "@pierre/diffs/worker";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  fileListKey,
  normalizeChangedFilePath,
} from "@/features/changed-files/identity";
import {
  EMPTY_PATH_COMMENTS,
  type CommentMeta,
  type PathComments,
} from "@/features/line-comments/commentMeta";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import { resolveActiveDiffPathFromScroll } from "./activePath";
import { appendCodeViewItems, buildCodeViewItems } from "./buildItems";
import { applyDisplayItems } from "./displayItems";
import {
  armRestore,
  cancelRestore as cancelRestoreState,
  fulfillRestoreIfReady,
  initialRestoreState,
  rearmRestoreOnPanelMount,
  tryFulfillRestore,
  type RestoreState,
} from "./restoreActivePath";

const EMPTY_RESTORE_STATE: RestoreState = initialRestoreState();

function addPath(prev: ReadonlySet<string>, path: string): Set<string> {
  if (prev.has(path)) return prev instanceof Set ? prev : new Set(prev);
  const next = new Set(prev);
  next.add(path);
  return next;
}

function removePath(prev: ReadonlySet<string>, path: string): Set<string> {
  if (!prev.has(path)) return prev instanceof Set ? prev : new Set(prev);
  const next = new Set(prev);
  next.delete(path);
  return next;
}

const PRIME_BATCH_SIZE = 4;

/** Warm the Shiki worker cache so file boundaries don't flash while scrolling. */
function primeDiffHighlights<T = undefined>(
  pool: WorkerPoolManager,
  items: readonly CodeViewDiffItem<T>[],
): void {
  let index = 0;

  const runBatch = () => {
    const end = Math.min(index + PRIME_BATCH_SIZE, items.length);
    for (; index < end; index++) {
      const item = items[index];
      if (item?.type === "diff" && item.fileDiff.cacheKey != null) {
        pool.primeDiffHighlightCache(item.fileDiff);
      }
    }
    if (index < items.length) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(runBatch, { timeout: 2000 });
      } else {
        setTimeout(runBatch, 0);
      }
    }
  };

  runBatch();
}

export interface PierreItemViewer<T = undefined> {
  getItem(id: string): { collapsed?: boolean; version?: number } | null | undefined;
  updateItem(item: CodeViewDiffItem<T>): void;
}

/**
 * `updateItem` only when collapse/version changed. Prime highlight cache once
 * per item id. Mutates `primedIds` (prune + add).
 */
export function syncPierreItems<T = undefined>(
  viewer: PierreItemViewer<T>,
  displayItems: readonly CodeViewDiffItem<T>[],
  primedIds: Set<string>,
  workerPool: WorkerPoolManager | null | undefined,
): void {
  for (const item of displayItems) {
    const existing = viewer.getItem(item.id);
    const collapsed = item.collapsed === true;
    const prevCollapsed = existing?.collapsed === true;
    if (prevCollapsed === collapsed && existing?.version === item.version) {
      continue;
    }
    viewer.updateItem(item);
  }

  const currentIds = new Set(displayItems.map((item) => item.id));
  for (const id of primedIds) {
    if (!currentIds.has(id)) {
      primedIds.delete(id);
    }
  }

  if (workerPool == null) return;

  const toPrime = displayItems.filter((item) => !primedIds.has(item.id));
  if (toPrime.length === 0) return;

  for (const item of toPrime) {
    primedIds.add(item.id);
  }
  primeDiffHighlights(workerPool, toPrime);
}

/**
 * True only when Pierre has laid out the item (`getTopForItem` defined) and
 * the scroll command was issued. False leaves one-shot restore pending.
 * Retries on ids change, post-sync, panel mount, or one deferred rAF; not a
 * multi-attempt rAF busy loop.
 */
function scrollToDiffPath(
  viewer: CodeViewHandle<CommentMeta> | null,
  path: string,
  behavior: "instant" | "smooth" = "instant",
): boolean {
  if (!viewer) return false;

  const instance = viewer.getInstance();
  if (instance == null) return false;

  const id = normalizeChangedFilePath(path);
  const top = instance.getTopForItem(id);
  if (top == null) return false;

  viewer.scrollTo({ type: "position", position: top, behavior });
  return true;
}

/**
 * Invariants:
 * - `selectedPath` never continuously drives `CodeView.scrollTo`. Only
 *   `navigate` and one-shot restore do.
 * - Restore is per-overview (`files` key): arm on key change from current
 *   `selectedPath`; fulfill when the normalized path is in `displayItemIds` and
 *   `scrollTo` succeeds. Panel remount re-arms from `selectedPath` even
 *   when `fileListKey` is unchanged, because CodeView starts at top after remount.
 *   Retry opportunities (not a busy loop): ids change, after sync,
 *   panel mount, and one deferred rAF when scroll failed because the item was
 *   not laid out yet. `navigate` / viewport scroll cancel.
 * - Unified/split is Pierre's job via `options.diffStyle`. This module must
 *   not capture/restore scroll on style change.
 * - Collapse application is pure over items; Pierre mutation happens only
 *   through `syncPierreItems` / `updateItem`.
 */
export interface DiffWorkspaceInputs {
  fileDiffs: FileDiffResult[];
  files: ChangedFile[];
  /** Comparison stamp. Included in item cache keys so identical patches rebuild. */
  mergeBaseOid?: string;
  headOid?: string;
  /** Review sets owned by Session; this module only applies them to items. */
  viewedPaths: ReadonlySet<string>;
  expandedWhileViewed: ReadonlySet<string>;
  /** Read for restore arming; never drives continuous scrollTo. */
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  codeViewRef: RefObject<CodeViewHandle<CommentMeta> | null>;
  workerPool: WorkerPoolManager | null | undefined;
  /**
   * Optional viewport→path callback for Active-file. When omitted, the scroll
   * handler calls `setSelectedPath` (compatibility until Wave C).
   */
  onViewportPath?: (path: string) => void;
  /**
   * When this changes, clear primed highlights and arm scroll restore without
   * remounting CodeView (Phase 3 setItems swap).
   */
  comparisonKey?: string | null;
  /** Line annotations keyed by item id. */
  itemAnnotations?: PathComments;
  /** Bump when annotations change so `syncPierreItems` sees a new `version`. */
  annotationsRev?: number;
}

export interface DiffWorkspacePanelBindings {
  displayItems: CodeViewDiffItem<CommentMeta>[];
  /** Pre-collapse build count (`codeViewItems.length`). */
  itemCount: number;
  setPanelRef: (node: HTMLElement | null) => void;
  handleScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<CommentMeta>["getInstance"]>>,
  ) => void;
}

export interface DiffWorkspaceNavigationSeam {
  /**
   * Tree / Active-file intent: cancel pending restore, then scroll CodeView.
   */
  navigate: (path: string) => void;
}

export interface DiffWorkspaceEditSeam {
  /** Paths currently in an edit session (editable AND activated). */
  editingPaths: ReadonlySet<string>;
  /** Paths that may enter edit mode. */
  editablePaths: ReadonlySet<string>;
  startEdit: (path: string) => void;
  endEdit: (path: string) => void;
}

export type DiffWorkspaceResult = DiffWorkspacePanelBindings &
  DiffWorkspaceNavigationSeam &
  DiffWorkspaceEditSeam;

function useCodeViewItems(
  fileDiffs: FileDiffResult[],
  files: ChangedFile[],
  mergeBaseOid: string,
  headOid: string,
): { items: CodeViewDiffItem[]; editablePaths: Set<string> } {
  const cacheRef = useRef<{
    filesKey: string;
    stampKey: string;
    items: CodeViewDiffItem[];
    editablePaths: Set<string>;
    diffCount: number;
  }>({
    filesKey: "",
    stampKey: "",
    items: [],
    editablePaths: new Set(),
    diffCount: 0,
  });

  return useMemo(() => {
    const key = fileListKey(files);
    const stampKey = `${mergeBaseOid}:${headOid}`;
    const cache = cacheRef.current;

    if (fileDiffs.length === 0 || files.length === 0) {
      cache.filesKey = key;
      cache.stampKey = stampKey;
      cache.items = [];
      cache.editablePaths = new Set();
      cache.diffCount = 0;
      return { items: [], editablePaths: cache.editablePaths };
    }

    if (
      key !== cache.filesKey ||
      stampKey !== cache.stampKey ||
      fileDiffs.length < cache.diffCount
    ) {
      const built = buildCodeViewItems(
        fileDiffs,
        files,
        mergeBaseOid,
        headOid,
      );
      cache.filesKey = key;
      cache.stampKey = stampKey;
      cache.items = built.items;
      cache.editablePaths = built.editablePaths;
      cache.diffCount = fileDiffs.length;
      return { items: built.items, editablePaths: built.editablePaths };
    }

    if (fileDiffs.length > cache.diffCount) {
      const batch = fileDiffs.slice(cache.diffCount);
      const { items, editablePaths } = appendCodeViewItems(
        cache.items,
        cache.editablePaths,
        batch,
        files,
        mergeBaseOid,
        headOid,
      );
      cache.items = items;
      cache.editablePaths = editablePaths;
      cache.diffCount = fileDiffs.length;
      return { items, editablePaths };
    }

    return { items: cache.items, editablePaths: cache.editablePaths };
  }, [fileDiffs, files, mergeBaseOid, headOid]);
}

/**
 * Callers must not import internals (`buildItems`, `activePath`,
 * `restoreActivePath`, `displayItems`) for app wiring; tests may import those
 * modules directly.
 *
 * Scroll and view-switch contract (also on `DiffWorkspaceInputs`):
 * `selectedPath` never drives `CodeView.scrollTo`. Manual scroll cancels
 * pending one-shot restore. Tree navigation and overview restore are the
 * only `scrollTo` callers.
 * Unified/split toggling is Pierre's: `setOptions` on `diffStyle` captures a
 * line-level layout anchor. Capturing scroll ourselves fights that anchor
 * and reintroduces oscillation/jump bugs.
 * On reload or panel remount, CodeView starts at the top while
 * `selectedPath`/tree may still point at a previously active file. One-shot
 * restore scrolls once the item is ready and laid out (retried on sync,
 * panel mount, or one deferred frame). Panel remount re-arms even when the
 * overview file set is unchanged.
 */
export function useDiffWorkspace({
  fileDiffs,
  files,
  mergeBaseOid = "",
  headOid = "",
  viewedPaths,
  expandedWhileViewed,
  selectedPath,
  setSelectedPath,
  codeViewRef,
  workerPool,
  onViewportPath,
  comparisonKey = null,
  itemAnnotations = EMPTY_PATH_COMMENTS,
  annotationsRev = 0,
}: DiffWorkspaceInputs): DiffWorkspaceResult {
  const { items, editablePaths } = useCodeViewItems(
    fileDiffs,
    files,
    mergeBaseOid,
    headOid,
  );

  const [editEnabledPaths, setEditEnabledPaths] = useState(
    () => new Set<string>(),
  );

  const startEdit = useCallback((path: string) => {
    const id = normalizeChangedFilePath(path);
    setEditEnabledPaths((prev) => addPath(prev, id));
  }, []);

  const endEdit = useCallback((path: string) => {
    const id = normalizeChangedFilePath(path);
    setEditEnabledPaths((prev) => removePath(prev, id));
  }, []);

  const displayItems = useMemo(
    () =>
      applyDisplayItems(items, {
        viewedPaths,
        expandedWhileViewed,
        editablePaths,
        editEnabledPaths,
        annotationsById: itemAnnotations,
        annotationsRev,
      }),
    [
      items,
      viewedPaths,
      expandedWhileViewed,
      editablePaths,
      editEnabledPaths,
      itemAnnotations,
      annotationsRev,
    ],
  );

  const displayItemIds = useMemo(
    () => displayItems.map((item) => item.id),
    [displayItems],
  );

  const displayItemsRef = useRef(displayItems);
  const displayItemIdsRef = useRef(displayItemIds);
  const selectedPathRef = useRef(selectedPath);
  const onViewportPathRef = useRef(onViewportPath);

  useLayoutEffect(() => {
    displayItemsRef.current = displayItems;
    displayItemIdsRef.current = displayItemIds;
    selectedPathRef.current = selectedPath;
    onViewportPathRef.current = onViewportPath;
  });

  const restoreRef = useRef<RestoreState>(EMPTY_RESTORE_STATE);
  const restoreLayoutRaf = useRef<number | null>(null);

  const clearRestoreLayoutRetry = useCallback(() => {
    if (restoreLayoutRaf.current != null) {
      cancelAnimationFrame(restoreLayoutRaf.current);
      restoreLayoutRaf.current = null;
    }
  }, []);

  /**
   * Try to fulfill pending restore. If the path is ready but Pierre has not
   * laid out tops yet, leave pending and schedule at most one rAF retry so the
   * next paint can succeed. Not a multi-frame spam loop.
   */
  const attemptRestoreFulfill = useCallback(() => {
    const before = restoreRef.current;
    if (before.pending == null) {
      clearRestoreLayoutRetry();
      return;
    }

    const after = fulfillRestoreIfReady(
      before,
      displayItemIdsRef.current,
      (path) => scrollToDiffPath(codeViewRef.current, path),
    );
    restoreRef.current = after;

    if (after.pending == null) {
      clearRestoreLayoutRetry();
      return;
    }

    // Pending path is in displayItemIds but scroll failed (viewer/tops not
    // ready). One deferred frame; Pierre often lays out after this commit.
    if (
      tryFulfillRestore(after.pending, displayItemIdsRef.current) != null &&
      restoreLayoutRaf.current == null
    ) {
      restoreLayoutRaf.current = requestAnimationFrame(() => {
        restoreLayoutRaf.current = null;
        if (restoreRef.current.pending == null) return;
        restoreRef.current = fulfillRestoreIfReady(
          restoreRef.current,
          displayItemIdsRef.current,
          (path) => scrollToDiffPath(codeViewRef.current, path),
        );
      });
    }
  }, [clearRestoreLayoutRetry, codeViewRef]);

  const panelRef = useRef<HTMLElement | null>(null);
  const scrollSyncRaf = useRef<number | null>(null);
  const primedHighlightIdsRef = useRef<Set<string> | null>(null);
  if (primedHighlightIdsRef.current === null) {
    primedHighlightIdsRef.current = new Set();
  }
  const prevComparisonKeyRef = useRef(comparisonKey);

  // Arm one-shot restore when the overview file set changes.
  useLayoutEffect(() => {
    restoreRef.current = armRestore(
      restoreRef.current,
      fileListKey(files),
      selectedPathRef.current,
    );
  }, [files]);

  // Comparison switch without remount: clear primed highlights, end edit
  // sessions, reset scroll, re-arm restore. Ending sessions fire
  // onItemEditComplete, which flushes.
  useLayoutEffect(() => {
    if (comparisonKey === prevComparisonKeyRef.current) return;
    prevComparisonKeyRef.current = comparisonKey;
    primedHighlightIdsRef.current?.clear();
    setEditEnabledPaths(new Set());
    codeViewRef.current?.scrollTo({ type: "position", position: 0 });
    restoreRef.current = armRestore(
      restoreRef.current,
      `cmp:${comparisonKey ?? ""}`,
      selectedPathRef.current,
    );
    attemptRestoreFulfill();
  }, [attemptRestoreFulfill, codeViewRef, comparisonKey]);

  // Fulfill when the target enters the viewport list.
  useLayoutEffect(() => {
    attemptRestoreFulfill();
  }, [attemptRestoreFulfill, displayItemIds]);

  // Sync items into Pierre, then retry restore. Tops are often ready only after
  // updateItem / child layout in this pass.
  useLayoutEffect(() => {
    const viewer = codeViewRef.current?.getInstance();
    if (viewer == null) return;
    syncPierreItems(
      viewer,
      displayItems,
      primedHighlightIdsRef.current!,
      workerPool,
    );
    attemptRestoreFulfill();
  }, [attemptRestoreFulfill, codeViewRef, displayItems, workerPool]);

  useLayoutEffect(
    () => () => {
      clearRestoreLayoutRetry();
    },
    [clearRestoreLayoutRetry],
  );

  const setPanelRef = useCallback(
    (node: HTMLElement | null) => {
      if (scrollSyncRaf.current != null) {
        cancelAnimationFrame(scrollSyncRaf.current);
      }
      scrollSyncRaf.current = null;
      panelRef.current = node;
      if (node == null) {
        clearRestoreLayoutRetry();
        return;
      }
      // First mount at scrollTop 0. Comparison switches clear highlights and
      // re-arm via the comparisonKey effect instead of remount.
      restoreRef.current = rearmRestoreOnPanelMount(
        restoreRef.current,
        selectedPathRef.current,
      );
      attemptRestoreFulfill();
    },
    [attemptRestoreFulfill, clearRestoreLayoutRetry],
  );

  const reportViewportPath = useCallback(
    (path: string) => {
      // Manual scroll is viewport intent. Do not let a pending one-shot restore
      // yank the user back when displayItemIds churns (diff batches, collapse).
      clearRestoreLayoutRetry();
      restoreRef.current = cancelRestoreState(restoreRef.current);
      if (path === selectedPathRef.current) return;
      selectedPathRef.current = path;
      const cb = onViewportPathRef.current;
      if (cb != null) {
        cb(path);
        return;
      }
      setSelectedPath(path);
    },
    [clearRestoreLayoutRetry, setSelectedPath],
  );

  // Stable identity so CodeView's per-render scroll resubscribe keeps one listener.
  const handleScroll = useCallback(
    (
      _scrollTop: number,
      viewer: NonNullable<ReturnType<CodeViewHandle<CommentMeta>["getInstance"]>>,
    ) => {
      if (scrollSyncRaf.current != null) {
        cancelAnimationFrame(scrollSyncRaf.current);
      }
      scrollSyncRaf.current = requestAnimationFrame(() => {
        scrollSyncRaf.current = null;
        const path = resolveActiveDiffPathFromScroll(
          viewer,
          displayItemIdsRef.current,
          viewer.getScrollTop(),
        );
        if (path != null) reportViewportPath(path);
      });
    },
    [reportViewportPath],
  );

  const navigate = useCallback(
    (path: string) => {
      clearRestoreLayoutRetry();
      restoreRef.current = cancelRestoreState(restoreRef.current);
      setSelectedPath(path);
      scrollToDiffPath(codeViewRef.current, path);
    },
    [clearRestoreLayoutRetry, codeViewRef, setSelectedPath],
  );

  return {
    displayItems,
    itemCount: items.length,
    setPanelRef,
    handleScroll,
    navigate,
    editingPaths: editEnabledPaths,
    editablePaths,
    startEdit,
    endEdit,
  };
}
