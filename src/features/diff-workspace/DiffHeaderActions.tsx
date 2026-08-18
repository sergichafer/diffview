import { openPath } from "@tauri-apps/plugin-opener";
import { IconButton } from "@/design/IconButton";
import type { FileSaveState } from "@/features/diff-edit/saveStatus";
import { resolveWorkingRepoPath } from "@/features/branch-compare/repoPaths";
import { isPreviewable } from "./preview";
import { ViewedToggle } from "./ViewedToggle";

export interface DiffHeaderActionsProps {
  repoPath: string;
  path: string;
  viewed: boolean;
  diffCollapsed: boolean;
  saveState?: FileSaveState;
  /** Text diff with a new side; Edit only if `editAllowed`. */
  editable: boolean;
  /** Live working tree; ref-to-ref stays read-only. */
  editAllowed: boolean;
  editing: boolean;
  onPreview: (path: string) => void;
  onViewedChange: (path: string, viewed: boolean) => void;
  onToggleDiffCollapsed: (path: string) => void;
  onStartEdit?: (path: string) => void;
  onSaveEdit?: (path: string) => void;
  onDiscardEdit?: (path: string) => void;
  onRetrySave?: (path: string) => void;
}

function saveLabel(state: FileSaveState | undefined): string | null {
  if (!state || state.status === "clean") return null;
  if (state.status === "hydrating") return "Loading file…";
  if (state.status === "dirty") return "Unsaved";
  if (state.status === "saving") return "Saving…";
  if (state.status === "error") {
    if (state.error?.includes("conflict:")) {
      return "Changed on disk. Not overwritten.";
    }
    return "Save failed";
  }
  return null;
}

export function DiffHeaderActions({
  repoPath,
  path,
  viewed,
  diffCollapsed,
  saveState,
  editable,
  editAllowed,
  editing,
  onPreview,
  onViewedChange,
  onToggleDiffCollapsed,
  onStartEdit,
  onSaveEdit,
  onDiscardEdit,
  onRetrySave,
}: DiffHeaderActionsProps) {
  const previewable = isPreviewable(path);
  const label = saveLabel(saveState);
  const isError = saveState?.status === "error";
  const canEdit = editable && editAllowed;
  const dirty = saveState?.status === "dirty" || saveState?.status === "error";

  return (
    <div className="diff-header-actions">
      <div className="diff-header-actions-tools">
        {label ? (
          isError && onRetrySave ? (
            <button
              type="button"
              className={`diff-save-status diff-save-status-error`}
              title={saveState?.error ?? "Retry save"}
              aria-live="polite"
              onClick={() => onRetrySave(path)}
            >
              {label}
            </button>
          ) : (
            <span
              className={`diff-save-status diff-save-status-${saveState?.status ?? "clean"}`}
              title={saveState?.error}
              aria-live="polite"
            >
              {label}
            </span>
          )
        ) : null}
        {canEdit && editing ? (
          <>
            <IconButton
              name="save"
              size="sm"
              title="Save"
              disabled={!dirty}
              onClick={() => onSaveEdit?.(path)}
            />
            <IconButton
              name="close"
              size="sm"
              title="Discard"
              onClick={() => onDiscardEdit?.(path)}
            />
          </>
        ) : canEdit ? (
          <IconButton
            name="edit"
            size="sm"
            title="Edit"
            onClick={() => onStartEdit?.(path)}
          />
        ) : (
          <span className="diff-header-actions-slot" aria-hidden="true" />
        )}
        <IconButton
          name={diffCollapsed ? "chevron-down" : "chevron-up"}
          size="sm"
          title={diffCollapsed ? "Expand diff" : "Collapse diff"}
          onClick={() => onToggleDiffCollapsed(path)}
        />
        {previewable ? (
          <IconButton name="preview" size="sm" onClick={() => onPreview(path)} />
        ) : (
          <span className="diff-header-actions-slot" aria-hidden="true" />
        )}
        <IconButton
          name="open"
          size="sm"
          onClick={() => {
            void openPath(resolveWorkingRepoPath(repoPath, path)).catch((err) =>
              console.error("Open failed:", err),
            );
          }}
        />
      </div>
      <ViewedToggle
        path={path}
        checked={viewed}
        onChange={(checked) => onViewedChange(path, checked)}
      />
    </div>
  );
}
