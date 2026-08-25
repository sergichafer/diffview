import { useMemo, useState } from "react";
import { IconGlyph } from "@/design/IconButton";
import { WORKSPACES_RAIL_WIDTH } from "@/shared/split-layout/splitter";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import { flattenWorkspaceNodes } from "@/features/workspaces/flatten";
import {
  onPressPointerDown,
  onPressPointerRelease,
} from "@/features/workspaces/press";
import { WorkspacesFooter } from "@/features/workspaces/WorkspacesFooter";
import { WorkspacesRail } from "@/features/workspaces/WorkspacesRail";
import { WorkspacesTree } from "@/features/workspaces/WorkspacesTree";

interface ReviewWorkspacesProps {
  width: number;
  columnCollapsed: boolean;
  onColumnCollapsedChange: (collapsed: boolean) => void;
  workspaces: ReadonlyArray<{ id: string; group: WorkspaceGroup }>;
  comparisons: Record<ComparisonKey, ComparisonRow>;
  activeKey: ComparisonKey;
  onRequestPalette: () => void;
}

export function ReviewWorkspaces({
  width,
  columnCollapsed,
  onColumnCollapsedChange,
  workspaces,
  comparisons,
  activeKey,
  onRequestPalette,
}: ReviewWorkspacesProps) {
  const [panelFocused, setPanelFocused] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const flatNodes = useMemo(
    () => flattenWorkspaceNodes(workspaces),
    [workspaces],
  );
  const focusKey = focusId ?? activeKey;

  return (
    <aside
      className={`workspaces${columnCollapsed ? " is-rail" : ""}`}
      style={{ width: columnCollapsed ? WORKSPACES_RAIL_WIDTH : width }}
      aria-label={columnCollapsed ? "Workspaces (collapsed)" : "Workspaces"}
      onPointerDown={onPressPointerDown}
      onPointerUp={onPressPointerRelease}
      onPointerCancel={onPressPointerRelease}
      onFocus={() => setPanelFocused(true)}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setPanelFocused(false);
        }
      }}
    >
      <div className="workspaces-head">
        <span className="workspaces-title">Workspaces</span>
        <span className="workspaces-head-actions">
          <button
            type="button"
            className={`workspaces-icon${columnCollapsed ? " workspaces-icon-add" : ""}`}
            data-press=""
            style={{ visibility: "visible" }}
            onClick={() => onColumnCollapsedChange(!columnCollapsed)}
            aria-label={
              columnCollapsed ? "Expand workspaces" : "Collapse sidebar"
            }
            title={
              columnCollapsed ? "Expand workspaces" : "Collapse sidebar"
            }
          >
            <IconGlyph name={columnCollapsed ? "expand" : "collapse"} />
          </button>
        </span>
      </div>
      <WorkspacesTree
        workspaces={workspaces}
        comparisons={comparisons}
        activeKey={activeKey}
        panelFocused={panelFocused}
        columnCollapsed={columnCollapsed}
        flatNodes={flatNodes}
        focusKey={focusKey}
        onFocusId={setFocusId}
        onActivate={() => {}}
        onToggleGroupCollapsed={() => {}}
        onCloseComparison={() => {}}
        onCloseWorkspace={() => {}}
        onOpenPaletteForWorkspace={onRequestPalette}
      />
      <WorkspacesRail
        workspaces={workspaces}
        comparisons={comparisons}
        activeKey={activeKey}
        columnCollapsed={columnCollapsed}
        onActivateWorkspace={() => onColumnCollapsedChange(false)}
        onAddWorkspace={() => {}}
      />
      <WorkspacesFooter inert={columnCollapsed} onAddWorkspace={() => {}} />
    </aside>
  );
}
