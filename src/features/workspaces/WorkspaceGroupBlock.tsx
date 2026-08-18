import { IconGlyph } from "@/design/IconButton";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import { WorkspaceComparisonRow } from "./WorkspaceComparisonRow";

interface WorkspaceGroupBlockProps {
  workspaceId: string;
  group: WorkspaceGroup;
  comparisons: Record<ComparisonKey, ComparisonRow>;
  activeKey: ComparisonKey | null;
  panelFocused: boolean;
  columnCollapsed: boolean;
  focusKey: string | null;
  onFocusId: (id: string) => void;
  onActivate: (key: ComparisonKey) => void;
  onToggleCollapsed: () => void;
  onCloseComparison: (key: ComparisonKey) => void;
  onCloseWorkspace: () => void;
  onOpenPalette: () => void;
}

export function WorkspaceGroupBlock({
  workspaceId,
  group,
  comparisons,
  activeKey,
  panelFocused,
  columnCollapsed,
  focusKey,
  onFocusId,
  onActivate,
  onToggleCollapsed,
  onCloseComparison,
  onCloseWorkspace,
  onOpenPalette,
}: WorkspaceGroupBlockProps) {
  return (
    <div
      className={`workspaces-group${group.collapsed ? " is-collapsed" : ""}`}
      role="group"
      aria-label={group.repo.name}
    >
      <div
        className={`workspaces-group-row${group.collapsed ? " is-collapsed" : ""}`}
        role="treeitem"
        aria-expanded={!group.collapsed}
        tabIndex={columnCollapsed ? -1 : focusKey === workspaceId ? 0 : -1}
        title={group.repo.path}
        data-ws-key={workspaceId}
        data-press=""
        onClick={onToggleCollapsed}
        onFocus={() => onFocusId(workspaceId)}
      >
        <span className="workspaces-caret" aria-hidden="true">
          <IconGlyph name="chevron-down" />
        </span>
        <span className="workspaces-group-name">{group.repo.name}</span>
        <span className="workspaces-group-actions">
          <button
            type="button"
            className="workspaces-icon workspaces-icon-add"
            data-press=""
            aria-label={`New comparison in ${group.repo.name}`}
            title="New comparison"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPalette();
            }}
          >
            <IconGlyph name="plus" />
          </button>
          <button
            type="button"
            className="workspaces-icon"
            data-press=""
            aria-label={`Close workspace ${group.repo.name}`}
            title="Close workspace"
            onClick={(e) => {
              e.stopPropagation();
              onCloseWorkspace();
            }}
          >
            <IconGlyph name="close" />
          </button>
        </span>
      </div>
      <div className="workspaces-fold" aria-hidden={group.collapsed || undefined}>
        <div className="workspaces-rows">
          {group.comparisonKeys.map((key) => {
            const row = comparisons[key];
            if (!row) return null;
            const selected = key === activeKey;
            return (
              <WorkspaceComparisonRow
                key={key}
                row={row}
                repoName={group.repo.name}
                selected={selected}
                panelFocused={panelFocused}
                tabIndex={
                  columnCollapsed || group.collapsed
                    ? -1
                    : focusKey === key
                      ? 0
                      : -1
                }
                onActivate={() => onActivate(key)}
                onClose={() => onCloseComparison(key)}
                onFocus={() => onFocusId(key)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
