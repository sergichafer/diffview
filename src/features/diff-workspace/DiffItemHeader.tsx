import type { CodeViewDiffItem } from "@pierre/diffs/react";
import { useCallback, useSyncExternalStore } from "react";
import type { FileSaveState } from "@/features/diff-edit/saveStatus";
import { DiffHeaderActions } from "./DiffHeaderActions";

interface DiffItemHeaderProps {
  repoPath: string;
  item: CodeViewDiffItem;
  viewedPaths: ReadonlySet<string>;
  expandedWhileViewed: ReadonlySet<string>;
  editablePaths: ReadonlySet<string>;
  editingPaths: ReadonlySet<string>;
  editAllowed: boolean;
  getSaveState: (path: string) => FileSaveState | undefined;
  subscribeSaveState: (path: string, cb: () => void) => () => void;
  onPreview: (path: string) => void;
  onViewedChange: (path: string, viewed: boolean) => void;
  onToggleDiffCollapsed: (path: string) => void;
  onStartEdit: (path: string) => void;
  onSaveEdit: (path: string) => void;
  onDiscardEdit: (path: string) => void;
  onRetrySave?: (path: string) => void;
}

/** Per-path save status; keep the slot portal identity stable. */
function DiffHeaderActionsSubscribed({
  repoPath,
  path,
  viewed,
  diffCollapsed,
  editable,
  editAllowed,
  editing,
  getSaveState,
  subscribeSaveState,
  onPreview,
  onViewedChange,
  onToggleDiffCollapsed,
  onStartEdit,
  onSaveEdit,
  onDiscardEdit,
  onRetrySave,
}: {
  repoPath: string;
  path: string;
  viewed: boolean;
  diffCollapsed: boolean;
  editable: boolean;
  editAllowed: boolean;
  editing: boolean;
  getSaveState: (path: string) => FileSaveState | undefined;
  subscribeSaveState: (path: string, cb: () => void) => () => void;
  onPreview: (path: string) => void;
  onViewedChange: (path: string, viewed: boolean) => void;
  onToggleDiffCollapsed: (path: string) => void;
  onStartEdit: (path: string) => void;
  onSaveEdit: (path: string) => void;
  onDiscardEdit: (path: string) => void;
  onRetrySave?: (path: string) => void;
}) {
  const subscribe = useCallback(
    (cb: () => void) => subscribeSaveState(path, cb),
    [path, subscribeSaveState],
  );
  const getSnapshot = useCallback(
    () => getSaveState(path),
    [path, getSaveState],
  );
  const saveState = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <DiffHeaderActions
      repoPath={repoPath}
      path={path}
      viewed={viewed}
      diffCollapsed={diffCollapsed}
      saveState={saveState}
      editable={editable}
      editAllowed={editAllowed}
      editing={editing}
      onPreview={onPreview}
      onViewedChange={onViewedChange}
      onToggleDiffCollapsed={onToggleDiffCollapsed}
      onStartEdit={onStartEdit}
      onSaveEdit={onSaveEdit}
      onDiscardEdit={onDiscardEdit}
      onRetrySave={onRetrySave}
    />
  );
}

export function useDiffItemHeader({
  repoPath,
  viewedPaths,
  expandedWhileViewed,
  editablePaths,
  editingPaths,
  editAllowed,
  getSaveState,
  subscribeSaveState,
  onPreview,
  onViewedChange,
  onToggleDiffCollapsed,
  onStartEdit,
  onSaveEdit,
  onDiscardEdit,
  onRetrySave,
}: Omit<DiffItemHeaderProps, "item">) {
  return useCallback(
    (item: CodeViewDiffItem) => {
      if (item.type !== "diff") return null;
      const viewed = viewedPaths.has(item.id);
      const flipped = expandedWhileViewed.has(item.id);
      const diffCollapsed = viewed ? !flipped : flipped;
      return (
        <DiffHeaderActionsSubscribed
          repoPath={repoPath}
          path={item.id}
          viewed={viewed}
          diffCollapsed={diffCollapsed}
          editable={editablePaths.has(item.id)}
          editAllowed={editAllowed}
          editing={editingPaths.has(item.id)}
          getSaveState={getSaveState}
          subscribeSaveState={subscribeSaveState}
          onPreview={onPreview}
          onViewedChange={onViewedChange}
          onToggleDiffCollapsed={onToggleDiffCollapsed}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onDiscardEdit={onDiscardEdit}
          onRetrySave={onRetrySave}
        />
      );
    },
    [
      repoPath,
      onPreview,
      onViewedChange,
      onToggleDiffCollapsed,
      onStartEdit,
      onSaveEdit,
      onDiscardEdit,
      onRetrySave,
      viewedPaths,
      expandedWhileViewed,
      editablePaths,
      editingPaths,
      editAllowed,
      getSaveState,
      subscribeSaveState,
    ],
  );
}
