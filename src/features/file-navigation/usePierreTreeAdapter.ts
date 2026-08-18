import type { UseFileTreeResult } from "@pierre/trees/react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { resolveSelectionToFile } from "@/features/changed-files/selection";
import type { ActiveFilePath } from "./types";

function pathFromTreeClick(event: { composedPath: () => EventTarget[] }): string | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLElement) {
      const path = node.dataset.itemPath;
      if (path) return path;
    }
  }
  return null;
}

/** Pierre's item.select() unions into the selection; keep a single active file. */
function selectOnlyTreePath(model: UseFileTreeResult["model"], path: string) {
  for (const selected of model.getSelectedPaths()) {
    if (selected !== path) {
      model.getItem(selected)?.deselect();
    }
  }
  const item = model.getItem(path);
  if (item != null && !item.isSelected()) {
    item.select();
  }
}

/**
 * Keep `syncingFromPropRef` true across select *and* scrollToPath: the latter
 * emits on the controller and must not be treated as user tree intent.
 */
export function syncTreeSelectionFromPath(
  model: UseFileTreeResult["model"],
  selectedPath: string,
  syncingFromPropRef: { current: boolean },
) {
  const current = model.getSelectedPaths();
  if (current.length === 1 && current[0] === selectedPath) {
    syncingFromPropRef.current = true;
    try {
      model.scrollToPath(selectedPath, { focus: false });
    } finally {
      syncingFromPropRef.current = false;
    }
    return;
  }

  syncingFromPropRef.current = true;
  try {
    selectOnlyTreePath(model, selectedPath);
    model.scrollToPath(selectedPath, { focus: false });
  } finally {
    syncingFromPropRef.current = false;
  }
}

export interface UsePierreTreeAdapterOptions {
  model: UseFileTreeResult["model"];
  paths: readonly string[];
  selectedPath: ActiveFilePath;
  /** Diff Workspace `navigate` (or equivalent). Active-file does not scroll. */
  onNavigate: (path: string) => void;
}

/**
 * Single-select only. Re-activating the already-selected row still fires
 * navigate; folder clicks resolve through inventory.
 */
export function usePierreTreeAdapter({
  model,
  paths,
  selectedPath,
  onNavigate,
}: UsePierreTreeAdapterOptions) {
  const syncingFromPropRef = useRef(false);
  const onNavigateRef = useRef(onNavigate);
  const pathsRef = useRef(paths);
  const selectedPathRef = useRef(selectedPath);

  useLayoutEffect(() => {
    onNavigateRef.current = onNavigate;
    pathsRef.current = paths;
    selectedPathRef.current = selectedPath;
  });

  const handleSelectionChange = useCallback(
    (selected: readonly string[]) => {
      if (syncingFromPropRef.current) return;

      const path = selected[0];
      if (!path) return;

      const filePath = resolveSelectionToFile(path, pathsRef.current);
      if (!filePath) return;

      if (filePath !== path) {
        syncingFromPropRef.current = true;
        try {
          selectOnlyTreePath(model, filePath);
        } finally {
          syncingFromPropRef.current = false;
        }
      }

      // Viewport (or prior navigate) already owns this path; do not call
      // navigate/scrollTo again (that fights continuous cross-file scrolling).
      if (filePath === selectedPathRef.current) return;

      onNavigate(filePath);
    },
    [model, onNavigate],
  );

  useLayoutEffect(() => {
    if (!selectedPath) return;
    syncTreeSelectionFromPath(model, selectedPath, syncingFromPropRef);
  }, [model, selectedPath]);

  useEffect(() => {
    const container = model.getFileTreeContainer();
    if (container == null) return;

    const handleActivate = (event: Event) => {
      const path = pathFromTreeClick(event);
      if (!path) return;

      const filePath = resolveSelectionToFile(path, pathsRef.current);
      if (!filePath || filePath !== selectedPathRef.current) return;

      onNavigateRef.current(filePath);
    };

    const handleKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      handleActivate(event);
    };

    container.addEventListener("click", handleActivate);
    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("click", handleActivate);
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [model]);

  return { handleSelectionChange };
}
