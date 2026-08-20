import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconGlyph } from "@/design/IconButton";
import { WORKSPACES_RAIL_WIDTH } from "@/shared/split-layout/splitter";
import { useRepoSession } from "@/features/repo-session/context";
import { comparisonNodes, flattenWorkspaceNodes } from "./flatten";
import { mostRecentKeyInGroup } from "./mru";
import {
  onPressPointerDown,
  onPressPointerRelease,
} from "./press";
import { WorkspacesFooter } from "./WorkspacesFooter";
import { WorkspacesRail } from "./WorkspacesRail";
import { WorkspacesTree } from "./WorkspacesTree";

interface WorkspacesPanelProps {
  width: number;
  onRequestPalette: () => void;
  panelFocused: boolean;
  onPanelFocusChange: (focused: boolean) => void;
}

export function WorkspacesPanel({
  width,
  onRequestPalette,
  panelFocused,
  onPanelFocusChange,
}: WorkspacesPanelProps) {
  const {
    workspaces,
    comparisons,
    activeKey,
    columnCollapsed,
    activateComparison,
    closeComparison,
    closeWorkspace,
    spawnComparison,
    addWorkspace,
    toggleGroupCollapsed,
    setColumnCollapsed,
    mruKeys,
  } = useRepoSession();

  const [focusId, setFocusId] = useState<string | null>(null);

  const flatNodes = useMemo(
    () => flattenWorkspaceNodes(workspaces),
    [workspaces],
  );

  const flatRows = useMemo(() => comparisonNodes(flatNodes), [flatNodes]);

  const focusKey = focusId ?? activeKey;

  const addWorkspaceFromPicker = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Add workspace",
    });
    if (typeof selected === "string") {
      void addWorkspace(selected);
    }
  }, [addWorkspace]);

  const activateWorkspaceMostRecent = useCallback(
    (workspaceId: string) => {
      const group = workspaces.find((w) => w.id === workspaceId)?.group;
      if (!group) return;
      const key = mostRecentKeyInGroup(mruKeys, group.comparisonKeys);
      if (key) activateComparison(key);
    },
    [activateComparison, mruKeys, workspaces],
  );

  const openPaletteForWorkspace = useCallback(
    (workspaceId: string) => {
      const group = workspaces.find((w) => w.id === workspaceId)?.group;
      if (!group) return;
      const key = mostRecentKeyInGroup(mruKeys, group.comparisonKeys);
      if (key) {
        activateComparison(key);
      } else {
        spawnComparison(
          workspaceId,
          group.repo.defaultBase,
          group.repo.headBranch,
        );
      }
      onRequestPalette();
    },
    [
      activateComparison,
      mruKeys,
      onRequestPalette,
      spawnComparison,
      workspaces,
    ],
  );

  // Cmd/Ctrl+1-9 and Cmd/Ctrl+Tab (MRU)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Tab") {
        e.preventDefault();
        const order = mruKeys.length > 0 ? mruKeys : flatRows.map((r) => r.key);
        if (order.length === 0) return;
        const idx = activeKey ? order.indexOf(activeKey) : -1;
        const next = order[(idx + 1) % order.length]!;
        activateComparison(next);
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const index = Number(e.key) - 1;
        const row = flatRows[index];
        if (!row) return;
        e.preventDefault();
        activateComparison(row.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activateComparison, activeKey, flatRows, mruKeys]);

  return (
    <aside
      className={`workspaces${columnCollapsed ? " is-rail" : ""}`}
      style={{ width: columnCollapsed ? WORKSPACES_RAIL_WIDTH : width }}
      aria-label={columnCollapsed ? "Workspaces (collapsed)" : "Workspaces"}
      onPointerDown={onPressPointerDown}
      onPointerUp={onPressPointerRelease}
      onPointerCancel={onPressPointerRelease}
      onFocus={() => onPanelFocusChange(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onPanelFocusChange(false);
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
            onClick={() => setColumnCollapsed(!columnCollapsed)}
            aria-label={
              columnCollapsed ? "Expand workspaces" : "Collapse sidebar"
            }
            title={columnCollapsed ? "Expand workspaces" : "Collapse sidebar"}
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
        onActivate={activateComparison}
        onToggleGroupCollapsed={toggleGroupCollapsed}
        onCloseComparison={closeComparison}
        onCloseWorkspace={closeWorkspace}
        onOpenPaletteForWorkspace={openPaletteForWorkspace}
      />
      <WorkspacesRail
        workspaces={workspaces}
        comparisons={comparisons}
        activeKey={activeKey}
        columnCollapsed={columnCollapsed}
        onActivateWorkspace={activateWorkspaceMostRecent}
        onAddWorkspace={() => void addWorkspaceFromPicker()}
      />
      <WorkspacesFooter
        inert={columnCollapsed}
        onAddWorkspace={() => void addWorkspaceFromPicker()}
      />
    </aside>
  );
}
