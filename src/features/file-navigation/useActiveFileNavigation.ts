import { useCallback, useState } from "react";
import { fileListKey } from "@/features/changed-files/identity";
import type { ActiveFilePath } from "./types";

export interface UseActiveFileNavigationOptions {
  /** Overview changed-file list; identity changes trigger keep-or-first reconcile. */
  files: readonly { path: string }[];
  /**
   * Per-comparison path from settings, used as the initial keep-or-first `prev`.
   * Re-applied when `comparisonKey` changes (multi-row switch without remount).
   */
  seedPath?: ActiveFilePath;
  /** When this changes, re-seed from `seedPath` (ComparisonKey switch). */
  comparisonKey?: string | null;
}

export interface ActiveFileNavigationResult {
  selectedPath: ActiveFilePath;
  setSelectedPath: (path: ActiveFilePath) => void;
}

export function resolveActivePathAfterOverview(
  prev: ActiveFilePath,
  files: readonly { path: string }[],
): ActiveFilePath {
  if (prev && files.some((f) => f.path === prev)) return prev;
  return files[0]?.path ?? null;
}

/**
 * Same-render reconcile when the overview file set identity changes.
 *
 * Callers must return `path` from this result in the current render, not after
 * a setState flush, so Diff Workspace can arm one-shot restore with the
 * reconciled path on the same overview paint.
 */
export function reconcileActivePathForFiles(
  storedPath: ActiveFilePath,
  storedKey: string,
  files: readonly { path: string }[],
): { path: ActiveFilePath; key: string; shouldCommit: boolean } {
  const key = fileListKey(files);
  if (key === storedKey) {
    return { path: storedPath, key, shouldCommit: false };
  }
  return {
    path: resolveActivePathAfterOverview(storedPath, files),
    key,
    shouldCommit: true,
  };
}

/**
 * Tree and viewport share one active path. This hook never calls
 * CodeView.scrollTo; Diff Workspace owns scroll via navigate / one-shot restore.
 *
 * Keep-or-first runs in the same render as a files identity change so restore
 * can arm from the reconciled path. Viewport reports go through setSelectedPath
 * (onViewportPath); tree clicks go through Diff Workspace navigate.
 * seedPath restores last selection across process reopen and comparison switches.
 */
export function useActiveFileNavigation({
  files,
  seedPath = null,
  comparisonKey = null,
}: UseActiveFileNavigationOptions): ActiveFileNavigationResult {
  const [selectedPath, setSelectedPathState] = useState<ActiveFilePath>(seedPath);
  // Must start as "", not fileListKey(files). AppBody mounts BranchWorkspace only
  // after overview exists, so the first render already has a non-empty file
  // list. Initializing to fileListKey(files) would skip reconcile and leave
  // selectedPath at the raw seed (possibly stale / not in the list).
  const [prevFilesKey, setPrevFilesKey] = useState("");
  const [prevComparisonKey, setPrevComparisonKey] = useState(comparisonKey);

  const isSwitch = comparisonKey !== prevComparisonKey;
  if (isSwitch) {
    setPrevComparisonKey(comparisonKey);
    setSelectedPathState(seedPath);
    setPrevFilesKey("");
  }

  // On a comparison switch the state above is still the previous row's path.
  // Reconcile from the new seed instead. Reconciling the stale path against
  // the new file set misses and commits files[0], clobbering the seed (and,
  // via usePersistActivePath, the remembered file for this comparison).
  const reconciled = reconcileActivePathForFiles(
    isSwitch ? seedPath : selectedPath,
    isSwitch ? "" : prevFilesKey,
    files,
  );
  if (reconciled.shouldCommit) {
    setPrevFilesKey(reconciled.key);
    setSelectedPathState(reconciled.path);
  }

  const setSelectedPath = useCallback((path: ActiveFilePath) => {
    setSelectedPathState(path);
  }, []);

  // Return reconciled.path (not state) so the overview paint sees the
  // keep-or-first path before the setState flush. Required for restore arming.
  return { selectedPath: reconciled.path, setSelectedPath };
}
