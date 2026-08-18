import { IconGlyph } from "@/design/IconButton";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import { repoInitial } from "./labels";

interface WorkspacesRailProps {
  workspaces: ReadonlyArray<{ id: string; group: WorkspaceGroup }>;
  comparisons: Record<ComparisonKey, ComparisonRow>;
  activeKey: ComparisonKey | null;
  columnCollapsed: boolean;
  onActivateWorkspace: (workspaceId: string) => void;
  onAddWorkspace: () => void;
}

export function WorkspacesRail({
  workspaces,
  comparisons,
  activeKey,
  columnCollapsed,
  onActivateWorkspace,
  onAddWorkspace,
}: WorkspacesRailProps) {
  return (
    <div className="workspaces-rail-inner" inert={!columnCollapsed}>
      {workspaces.map(({ id, group }) => {
        const hasLive = group.comparisonKeys.some(
          (k) => comparisons[k]?.isLive,
        );
        const isActive =
          activeKey != null && new Set(group.comparisonKeys).has(activeKey);
        return (
          <button
            key={id}
            type="button"
            className={`workspaces-rail-glyph${isActive ? " is-active" : ""}`}
            data-press=""
            aria-label={group.repo.name}
            title={group.repo.name}
            tabIndex={columnCollapsed ? 0 : -1}
            onClick={() => onActivateWorkspace(id)}
          >
            {repoInitial(group.repo.name)}
            {hasLive && (
              <span className="workspaces-live-dot" title="Live comparison" />
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="workspaces-icon workspaces-icon-add"
        data-press=""
        tabIndex={columnCollapsed ? 0 : -1}
        onClick={onAddWorkspace}
        aria-label="Add workspace"
        title="Add workspace"
      >
        <IconGlyph name="plus" />
      </button>
    </div>
  );
}
