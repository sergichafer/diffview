import type { FileContents, FileDiffMetadata, DiffsEditor } from "@pierre/diffs";
import type { Editor } from "@pierre/diffs/edit";
import type { CodeViewItem } from "@pierre/diffs/react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { api } from "@/shared/tauri/api";
import {
  isReplaceableEditor,
  replaceEditorText,
  type ReplaceableEditor,
} from "./replaceEditorText";
import type { FileSaveState } from "./saveStatus";

type SaveStateListener = () => void;

type HydrationSides = {
  oldFile: FileContents | null;
  newFile: FileContents;
};

/**
 * Only change/rename partials go through `loadDiffFiles`. `new`/`deleted`
 * stay `isPartial: true` from the parser but are not hydrated that way;
 * new files use `seedNewFileBaseline` instead.
 */
function needsHydration(fileDiff: Pick<FileDiffMetadata, "type" | "isPartial">): boolean {
  const t = fileDiff.type;
  return (
    fileDiff.isPartial &&
    (t === "change" || t === "rename-changed" || t === "rename-pure")
  );
}

function hydrationCacheKey(
  baseBranch: string,
  headBranch: string,
  path: string,
  oldPath?: string | null,
): string {
  return `${baseBranch}\0${headBranch}\0${path}\0${oldPath ?? ""}`;
}

/** Shallow copies so Pierre remounts get fresh object identities. */
function cloneHydrationSides(sides: HydrationSides): HydrationSides {
  return {
    oldFile: sides.oldFile ? { ...sides.oldFile } : null,
    newFile: { ...sides.newFile },
  };
}

type UseDiffEditArgs = {
  repoPath: string | null;
  baseBranch: string;
  headBranch: string;
  isLive: boolean;
  onSavedLive?: () => void;
};

/**
 * Hydrate patch diffs with full file sides and write the new side to the
 * working tree on explicit Save. Status is per path for header chips.
 *
 * Saves are gated until full contents are known (loadDiffFiles for change/
 * rename, or an explicit comparison read for `new` files) so we never write
 * patch-truncated buffers to disk. Writes are compare-and-swap against the
 * last hydrated/saved baseline. Discard restores the editor to that baseline
 * and skips the safety-net flush on session end.
 */
export function useDiffEdit<T = undefined>({
  repoPath,
  baseBranch,
  headBranch,
  isLive,
  onSavedLive,
}: UseDiffEditArgs) {
  /**
   * External store (not React state) so hydrate/save flips notify only the
   * subscribed header for that path, not every visible header portal.
   */
  const saveStatesRef = useRef(new Map<string, FileSaveState>());
  const saveStateListeners = useRef(new Map<string, Set<SaveStateListener>>());
  const lastSaved = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, string>());
  /** Paths whose full new-side contents are known; safe to write. */
  const saveReady = useRef(new Set<string>());
  const seeding = useRef(new Set<string>());
  /** Skip onItemEditChange while Discard restores the editor document. */
  const restoring = useRef(new Set<string>());
  /** Skip the next onItemEditComplete flush (Discard). */
  const skipFlushOnce = useRef(new Set<string>());
  /**
   * Full-file sides from readComparisonFile. External on-disk edits between
   * hydrations can stale this; writeWorkingFile's compare-and-swap (`expected`)
   * already guards correctness.
   */
  const hydrationCache = useRef(new Map<string, HydrationSides>());
  const onSavedLiveRef = useRef(onSavedLive);
  useLayoutEffect(() => {
    onSavedLiveRef.current = onSavedLive;
  });

  const notifySaveState = useCallback((path: string) => {
    const listeners = saveStateListeners.current.get(path);
    if (!listeners) return;
    for (const cb of listeners) cb();
  }, []);

  const getSaveState = useCallback(
    (path: string): FileSaveState | undefined => saveStatesRef.current.get(path),
    [],
  );

  const subscribeSaveState = useCallback(
    (path: string, cb: SaveStateListener): (() => void) => {
      let listeners = saveStateListeners.current.get(path);
      if (!listeners) {
        listeners = new Set();
        saveStateListeners.current.set(path, listeners);
      }
      listeners.add(cb);
      return () => {
        listeners!.delete(cb);
        if (listeners!.size === 0) {
          saveStateListeners.current.delete(path);
        }
      };
    },
    [],
  );

  const setStatus = useCallback(
    (path: string, state: FileSaveState) => {
      if (state.status === "clean") {
        if (!saveStatesRef.current.has(path)) return;
        saveStatesRef.current.delete(path);
      } else {
        saveStatesRef.current.set(path, state);
      }
      notifySaveState(path);
    },
    [notifySaveState],
  );

  const clearEditState = useCallback(() => {
    saveReady.current.clear();
    lastSaved.current.clear();
    pending.current.clear();
    seeding.current.clear();
    restoring.current.clear();
    skipFlushOnce.current.clear();
    hydrationCache.current.clear();
    const paths = [...saveStatesRef.current.keys()];
    saveStatesRef.current.clear();
    for (const path of paths) notifySaveState(path);
  }, [notifySaveState]);

  // Drop baselines/pending when the comparison changes.
  useEffect(() => {
    clearEditState();
  }, [repoPath, baseBranch, headBranch, clearEditState]);

  const flushSave = useCallback(
    async (path: string, contents: string): Promise<boolean> => {
      if (!repoPath) return false;
      if (!saveReady.current.has(path)) return false;
      if (lastSaved.current.get(path) === contents) {
        pending.current.delete(path);
        setStatus(path, { status: "clean" });
        return true;
      }
      setStatus(path, { status: "saving" });
      // Missing key: file was absent at baseline (`expected: null`).
      const expected = lastSaved.current.get(path) ?? null;
      try {
        await api.writeWorkingFile(repoPath, path, contents, expected);
        lastSaved.current.set(path, contents);
        if (pending.current.get(path) === contents) {
          pending.current.delete(path);
        }
        // Keep hydration cache aligned with our own writes.
        for (const [key, entry] of hydrationCache.current) {
          if (entry.newFile.name === path) {
            hydrationCache.current.set(key, {
              oldFile: entry.oldFile,
              newFile: { ...entry.newFile, contents },
            });
          }
        }
        setStatus(path, { status: "clean" });
        if (isLive) onSavedLiveRef.current?.();
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus(path, { status: "error", error: message });
        return false;
      }
    },
    [repoPath, isLive, setStatus],
  );

  const markDirty = useCallback(
    (path: string, contents: string) => {
      if (!isLive) return;
      if (!saveReady.current.has(path)) {
        pending.current.set(path, contents);
        setStatus(path, { status: "dirty" });
        return;
      }
      pending.current.set(path, contents);
      if (lastSaved.current.get(path) === contents) {
        pending.current.delete(path);
        setStatus(path, { status: "clean" });
        return;
      }
      setStatus(path, { status: "dirty" });
    },
    [isLive, setStatus],
  );

  const markSaveReady = useCallback(
    (path: string, baseline: string | null) => {
      if (baseline == null) {
        lastSaved.current.delete(path);
      } else {
        lastSaved.current.set(path, baseline);
      }
      saveReady.current.add(path);
      setStatus(path, { status: "clean" });
    },
    [setStatus],
  );

  const loadDiffFiles = useCallback(
    async (fileDiff: FileDiffMetadata) => {
      if (!repoPath) {
        throw new Error("No repository open");
      }
      const path = fileDiff.name;
      // Remount re-hydration (editor scrolled back into view) must not drop a
      // pending buffer or re-baseline. Only first-time hydration clears
      // pre-hydration (patch-truncated) buffers.
      const wasReady = saveReady.current.has(path);
      const oldPath = fileDiff.prevName;
      const key = hydrationCacheKey(baseBranch, headBranch, path, oldPath);
      const cached = hydrationCache.current.get(key);
      if (cached) {
        if (!wasReady) {
          // Drop any pre-hydration buffer; it may be patch-truncated.
          pending.current.delete(path);
          markSaveReady(path, cached.newFile.contents);
        }
        const fresh = cloneHydrationSides(cached);
        // Pierre requires oldFile: null for rename-pure hydration.
        if (fileDiff.type === "rename-pure") {
          return { oldFile: null, newFile: fresh.newFile };
        }
        return fresh;
      }
      setStatus(path, { status: "hydrating" });
      let sides;
      try {
        sides = await api.readComparisonFile(
          repoPath,
          baseBranch,
          headBranch,
          path,
          oldPath,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus(path, { status: "error", error: message });
        throw e;
      }
      const oldName = oldPath ?? path;
      const oldContents = sides.old ?? "";
      const newContents = sides.new ?? "";
      if (!wasReady) {
        // Drop any pre-hydration buffer; it may be patch-truncated.
        pending.current.delete(path);
        markSaveReady(path, sides.new ?? null);
      }
      const newFile: FileContents = {
        name: path,
        contents: newContents,
        cacheKey: `new:${path}`,
      };
      // Pierre requires oldFile: null for rename-pure hydration.
      const result: HydrationSides =
        fileDiff.type === "rename-pure"
          ? { oldFile: null, newFile }
          : {
              oldFile: {
                name: oldName,
                contents: oldContents,
                cacheKey: `old:${oldName}`,
              },
              newFile,
            };
      hydrationCache.current.set(key, result);
      return cloneHydrationSides(result);
    },
    [repoPath, baseBranch, headBranch, markSaveReady, setStatus],
  );

  const seedNewFileBaseline = useCallback(
    async (path: string) => {
      if (!repoPath || saveReady.current.has(path) || seeding.current.has(path)) {
        return;
      }
      seeding.current.add(path);
      const key = hydrationCacheKey(baseBranch, headBranch, path, null);
      const cached = hydrationCache.current.get(key);
      try {
        let baseline: string | null;
        if (cached) {
          baseline = cached.newFile.contents;
        } else {
          setStatus(path, { status: "hydrating" });
          const sides = await api.readComparisonFile(
            repoPath,
            baseBranch,
            headBranch,
            path,
            null,
          );
          baseline = sides.new ?? null;
          const newContents = sides.new ?? "";
          hydrationCache.current.set(key, {
            oldFile:
              sides.old == null
                ? null
                : {
                    name: path,
                    contents: sides.old,
                    cacheKey: `old:${path}`,
                  },
            newFile: {
              name: path,
              contents: newContents,
              cacheKey: `new:${path}`,
            },
          });
        }
        const latest = pending.current.get(path);
        markSaveReady(path, baseline);
        if (latest != null && latest !== (baseline ?? undefined)) {
          pending.current.set(path, latest);
          setStatus(path, { status: "dirty" });
        } else {
          setStatus(path, { status: "clean" });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus(path, { status: "error", error: message });
      } finally {
        seeding.current.delete(path);
      }
    },
    [repoPath, baseBranch, headBranch, markSaveReady, setStatus],
  );

  const onItemEditChange = useCallback(
    (item: CodeViewItem<T>, file: FileContents) => {
      if (!isLive) return;
      if (restoring.current.has(item.id)) return;
      if (item.type === "diff" && needsHydration(item.fileDiff)) {
        if (!saveReady.current.has(item.id)) {
          // Wait for attachEditor → loadDiffFiles; do not queue partial buffers.
          setStatus(item.id, { status: "hydrating" });
          return;
        }
      } else if (!saveReady.current.has(item.id)) {
        // `new` (and similar): seed full baseline; write only on Save.
        pending.current.set(item.id, file.contents);
        setStatus(item.id, { status: "dirty" });
        void seedNewFileBaseline(item.id);
        return;
      }
      markDirty(item.id, file.contents);
    },
    [isLive, markDirty, seedNewFileBaseline, setStatus],
  );

  const onItemEditComplete = useCallback(
    (item: CodeViewItem<T>, file: FileContents) => {
      if (!isLive) return;
      if (skipFlushOnce.current.delete(item.id)) {
        pending.current.delete(item.id);
        setStatus(item.id, { status: "clean" });
        return;
      }
      if (!saveReady.current.has(item.id)) return;
      // Safety net: comparison switch / unexpected session end still writes.
      pending.current.set(item.id, file.contents);
      void flushSave(item.id, file.contents);
    },
    [flushSave, isLive, setStatus],
  );

  const saveEdit = useCallback(
    async (path: string): Promise<boolean> => {
      if (!isLive) return false;
      const latest = pending.current.get(path);
      if (latest == null) {
        if (saveReady.current.has(path)) {
          setStatus(path, { status: "clean" });
          return true;
        }
        return false;
      }
      return flushSave(path, latest);
    },
    [flushSave, isLive, setStatus],
  );

  const discardEdit = useCallback(
    (path: string, editor?: Editor<T> | DiffsEditor<T> | ReplaceableEditor | null) => {
      skipFlushOnce.current.add(path);
      restoring.current.add(path);
      try {
        if (saveReady.current.has(path)) {
          const baseline = lastSaved.current.get(path) ?? "";
          replaceEditorText(
            isReplaceableEditor(editor) ? editor : null,
            baseline,
          );
        }
      } finally {
        restoring.current.delete(path);
      }
      pending.current.delete(path);
      setStatus(path, { status: "clean" });
    },
    [setStatus],
  );

  const retrySave = useCallback(
    (path: string) => {
      const latest = pending.current.get(path);
      if (latest == null) return;
      void flushSave(path, latest);
    },
    [flushSave],
  );

  return {
    getSaveState,
    subscribeSaveState,
    loadDiffFiles,
    onItemEditChange,
    onItemEditComplete,
    retrySave,
    saveEdit,
    discardEdit,
  };
}
