import { normalizeChangedFilePath } from "@/features/changed-files/identity";

/** Per-overview one-shot restore of the CodeView viewport to `selectedPath`. */
export type RestoreState = {
  filesKey: string;
  pending: string | null;
};

export function initialRestoreState(): RestoreState {
  return { filesKey: "", pending: null };
}

/** Same overview `filesKey` is a no-op (no re-arm). */
export function armRestore(
  state: RestoreState,
  filesKey: string,
  selectedPath: string | null,
): RestoreState {
  if (state.filesKey === filesKey) return state;
  return { filesKey, pending: selectedPath };
}

/** Explicit navigate cancels any pending restore. */
export function cancelRestore(state: RestoreState): RestoreState {
  if (state.pending == null) return state;
  return { ...state, pending: null };
}

/**
 * Re-arm pending when CodeView remounts after a prior fulfill.
 *
 * `armRestore` is one-shot per overview `filesKey`. A panel remount with the
 * same key (fileDiffs cleared, itemCount gate, panel `key=`) leaves pending
 * null while the new CodeView starts at the top; tree/seed still correct.
 * Call this from the panel ref attach seam only.
 */
export function rearmRestoreOnPanelMount(
  state: RestoreState,
  selectedPath: string | null,
): RestoreState {
  if (selectedPath == null) return state;
  // Not yet armed for an overview; let `armRestore` own the first paint.
  if (state.filesKey === "") return state;
  if (state.pending === selectedPath) return state;
  return { ...state, pending: selectedPath };
}

export function tryFulfillRestore(
  pending: string | null,
  displayItemIds: readonly string[],
): string | null {
  if (pending == null) return null;
  const id = normalizeChangedFilePath(pending);
  if (!displayItemIds.includes(id)) return null;
  return pending;
}

export function markRestoreFulfilled(state: RestoreState): RestoreState {
  if (state.pending == null) return state;
  return { ...state, pending: null };
}

/**
 * One-shot restore. Success clears pending. A failed scroll (item not laid
 * out yet) leaves pending so a later opportunity can retry: panel mount,
 * post-sync layout, or a single deferred frame. Not a busy loop.
 */
export function fulfillRestoreIfReady(
  state: RestoreState,
  displayItemIds: readonly string[],
  scroll: (path: string) => boolean,
): RestoreState {
  const target = tryFulfillRestore(state.pending, displayItemIds);
  if (target == null) return state;
  if (!scroll(target)) return state;
  return markRestoreFulfilled(state);
}
