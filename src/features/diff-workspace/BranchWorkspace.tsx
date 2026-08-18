import {
  useWorkerPool,
  type CodeViewHandle,
} from "@pierre/diffs/react";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { getActivePathForComparison } from "@/features/file-navigation/activePathByRepo";
import { useActiveFileNavigation } from "@/features/file-navigation/useActiveFileNavigation";
import { usePersistActivePath } from "@/features/file-navigation/usePersistActivePath";
import { useDiffReview } from "@/features/diff-review/DiffReviewProvider";
import type { AppSettings } from "@/shared/types/app";
import { WORKSPACES_RAIL_WIDTH } from "@/shared/split-layout/splitter";
import { useDiffWorkspace } from "./useDiffWorkspace";
import { openPreviewWindow } from "./preview";
import { useRepoSession } from "@/features/repo-session/context";
import { BranchDiffPanel } from "./BranchDiffPanel";
import { DiffStyleBar } from "./DiffStyleBar";
import { FileTreePanel } from "./FileTreePanel";
import { WorkspacesPanel } from "@/features/workspaces/WorkspacesPanel";
import { WorkspaceSplitter } from "@/features/workspaces/WorkspaceSplitter";

interface BranchWorkspaceProps {
  resolvedTheme: "light" | "dark";
  splitWidth: number;
  workspacesWidth: number;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  splitterDragging: boolean;
  splitterSettling: boolean;
  onSplitterPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  workspacesSplitterDragging: boolean;
  workspacesSplitterSettling: boolean;
  onWorkspacesSplitterPointerDown: (
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onWorkspacesSplitterKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onDiffStyleChange: (diffStyle: AppSettings["diffStyle"]) => void;
  onRequestPalette: () => void;
  topBar: ReactNode;
}

export function BranchWorkspace({
  resolvedTheme,
  splitWidth,
  workspacesWidth,
  settings,
  updateSettings,
  splitterDragging,
  splitterSettling,
  onSplitterPointerDown,
  onSplitterKeyDown,
  workspacesSplitterDragging,
  workspacesSplitterSettling,
  onWorkspacesSplitterPointerDown,
  onWorkspacesSplitterKeyDown,
  onDiffStyleChange,
  onRequestPalette,
  topBar,
}: BranchWorkspaceProps) {
  const {
    repo,
    overview,
    fileDiffs,
    activeKey,
    columnCollapsed,
    activeMergeBase,
  } = useRepoSession();
  const { viewedPaths, expandedWhileViewed } = useDiffReview();
  const [wsPanelFocused, setWsPanelFocused] = useState(false);

  const codeViewRef = useRef<CodeViewHandle<undefined> | null>(null);
  const workerPool = useWorkerPool();
  const files = overview?.files ?? [];
  const seedPath =
    activeKey != null
      ? getActivePathForComparison(settings.activePathByComparison, activeKey)
      : null;

  const activeFile = useActiveFileNavigation({
    files,
    seedPath,
    comparisonKey: activeKey,
  });

  usePersistActivePath({
    comparisonKey: activeKey,
    selectedPath: activeFile.selectedPath,
    activePathByComparison: settings.activePathByComparison,
    update: updateSettings,
  });

  const workspace = useDiffWorkspace({
    fileDiffs,
    files,
    mergeBaseOid: activeMergeBase,
    headOid: overview?.headOid ?? "",
    viewedPaths,
    expandedWhileViewed,
    selectedPath: activeFile.selectedPath,
    setSelectedPath: activeFile.setSelectedPath,
    onViewportPath: activeFile.setSelectedPath,
    codeViewRef,
    workerPool,
    comparisonKey: activeKey,
  });

  const handlePreview = (path: string) => {
    if (repo) void openPreviewWindow(repo.path, path);
  };

  const wsWidth = columnCollapsed ? WORKSPACES_RAIL_WIDTH : workspacesWidth;
  const showDiffChrome = overview != null;

  return (
    <div className="app-body">
      <div className="workspace-sheet">
        <WorkspacesPanel
          width={wsWidth}
          onRequestPalette={onRequestPalette}
          panelFocused={wsPanelFocused}
          onPanelFocusChange={setWsPanelFocused}
        />
        {!columnCollapsed && (
          <WorkspaceSplitter
            width={workspacesWidth}
            label="workspaces"
            dragging={workspacesSplitterDragging}
            settling={workspacesSplitterSettling}
            onPointerDown={onWorkspacesSplitterPointerDown}
            onKeyDown={onWorkspacesSplitterKeyDown}
          />
        )}
        <div className="sheet-pane app-main">
          {topBar}
          <main id="main-content" className="workspace">
            {showDiffChrome ? (
              <>
                <FileTreePanel
                  themeMode={resolvedTheme}
                  themeId={settings.themeId}
                  uiFont={settings.uiFont}
                  width={splitWidth}
                  selectedPath={activeFile.selectedPath}
                  onNavigate={workspace.navigate}
                />
                <WorkspaceSplitter
                  width={splitWidth}
                  dragging={splitterDragging}
                  settling={splitterSettling}
                  onPointerDown={onSplitterPointerDown}
                  onKeyDown={onSplitterKeyDown}
                />
                <div className="main-column">
                  <DiffStyleBar
                    settings={settings}
                    fileCount={overview.files.length}
                    onChangeDiffStyle={onDiffStyleChange}
                  />
                  <BranchDiffPanel
                    codeViewRef={codeViewRef}
                    displayItems={workspace.displayItems}
                    itemCount={workspace.itemCount}
                    setPanelRef={workspace.setPanelRef}
                    onScroll={workspace.handleScroll}
                    editAllowed={overview.isLive}
                    editablePaths={workspace.editablePaths}
                    editingPaths={workspace.editingPaths}
                    onStartEdit={workspace.startEdit}
                    onEndEdit={workspace.endEdit}
                    diffStyle={settings.diffStyle}
                    themeMode={resolvedTheme}
                    themeId={settings.themeId}
                    uiFont={settings.uiFont}
                    codeFont={settings.codeFont}
                    onPreview={handlePreview}
                  />
                </div>
              </>
            ) : (
              <div className="main-column workspace is-loading" style={{ flex: 1 }}>
                <p aria-live="polite">Loading the branch…</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
