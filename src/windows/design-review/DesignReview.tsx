import { useCallback, useMemo, useRef, useState } from "react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useAppFonts } from "@/design/fonts/useAppFonts";
import { DEFAULT_THEME_ID } from "@/design/theme/registry";
import { useAppTheme, useResolvedTheme } from "@/design/theme/useResolvedTheme";
import { useChromeGlow } from "@/design/useChromeGlow";
import { DiffStyleBar } from "@/features/diff-workspace/DiffStyleBar";
import { WorkspaceSplitter } from "@/features/workspaces/WorkspaceSplitter";
import { useSplitResize } from "@/shared/split-layout/useSplitResize";
import {
  WORKSPACES_MAX_WIDTH,
  WORKSPACES_MIN_WIDTH,
} from "@/shared/split-layout/splitter";
import { DEFAULT_SETTINGS, type DiffStyle } from "@/shared/types/app";
import type { CommentMeta } from "./commentMeta";
import type { ExportShape } from "./ExportControl";
import {
  REVIEW_COMPARISON_KEY,
  REVIEW_DIFF_RESULTS,
  REVIEW_FILES,
  REVIEW_HEAD,
  REVIEW_METADATA,
  REVIEW_OVERVIEW,
  REVIEW_REPO,
  REVIEW_WORKSPACE_ID,
  reviewComparisonRow,
  reviewWorkspaceGroup,
} from "./fixture";
import { ReviewCodePane } from "./ReviewCodePane";
import { ReviewFileTree } from "./ReviewFileTree";
import { ReviewHud } from "./ReviewHud";
import { ReviewTopBar } from "./ReviewTopBar";
import { ReviewWorkspaces } from "./ReviewWorkspaces";
import type { RestingCopy } from "./restingLabel";
import "@/windows/main/App.css";
import "./design-review.css";

export function DesignReview() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [shape, setShape] = useState<ExportShape>("chip");
  const [copy, setCopy] = useState<RestingCopy>("review");
  const [card, setCard] = useState<"saved" | "draft">("saved");
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    DEFAULT_SETTINGS.diffStyle,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(
    REVIEW_FILES[0]?.path ?? null,
  );
  const [columnCollapsed, setColumnCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const persistWidth = useCallback(() => {}, []);
  const {
    splitWidth,
    dragging: splitterDragging,
    settling: splitterSettling,
    onSplitterPointerDown,
    onSplitterKeyDown,
  } = useSplitResize(DEFAULT_SETTINGS.splitWidth, persistWidth);
  const {
    splitWidth: workspacesWidth,
    dragging: workspacesSplitterDragging,
    settling: workspacesSplitterSettling,
    onSplitterPointerDown: onWorkspacesSplitterPointerDown,
    onSplitterKeyDown: onWorkspacesSplitterKeyDown,
  } = useSplitResize(DEFAULT_SETTINGS.workspacesWidth, persistWidth, {
    minWidth: WORKSPACES_MIN_WIDTH,
    maxWidth: WORKSPACES_MAX_WIDTH,
  });

  const resolvedTheme = useResolvedTheme(themeMode);
  const themeId = DEFAULT_THEME_ID;
  useAppTheme(resolvedTheme, themeId);
  useAppFonts(DEFAULT_SETTINGS.uiFont, DEFAULT_SETTINGS.codeFont);

  const appRef = useRef<HTMLDivElement>(null);
  const codeViewRef = useRef<CodeViewHandle<CommentMeta> | null>(null);
  useChromeGlow(appRef);

  const workspaces = useMemo(
    () => [{ id: REVIEW_WORKSPACE_ID, group: reviewWorkspaceGroup() }],
    [],
  );
  const comparisons = useMemo(
    () => ({ [REVIEW_COMPARISON_KEY]: reviewComparisonRow() }),
    [],
  );
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, diffStyle, themeMode, themeId }),
    [diffStyle, themeMode, themeId],
  );

  const navigate = useCallback((path: string) => {
    setSelectedPath(path);
    codeViewRef.current?.scrollTo({
      type: "item",
      id: path,
      align: "start",
    });
  }, []);

  return (
    <div
      ref={appRef}
      className="app"
      data-theme={resolvedTheme}
      data-palette={themeId}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <ReviewHud
        themeMode={themeMode}
        onThemeMode={setThemeMode}
        shape={shape}
        onShape={setShape}
        copy={copy}
        onCopy={setCopy}
        card={card}
        onCard={setCard}
      />
      <div className="app-body">
        <div className="workspace-sheet">
          <ReviewWorkspaces
            width={workspacesWidth}
            columnCollapsed={columnCollapsed}
            onColumnCollapsedChange={setColumnCollapsed}
            workspaces={workspaces}
            comparisons={comparisons}
            activeKey={REVIEW_COMPARISON_KEY}
            onRequestPalette={() => setPaletteOpen(true)}
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
            <ReviewTopBar
              repoName={REVIEW_REPO.name}
              headBranch={REVIEW_HEAD}
              baseBranch={REVIEW_OVERVIEW.baseBranch}
              branches={["main", "feat/comments"]}
              metadata={REVIEW_METADATA}
              overview={REVIEW_OVERVIEW}
              fileDiffs={REVIEW_DIFF_RESULTS}
              paletteOpen={paletteOpen}
              onPaletteOpenChange={setPaletteOpen}
            />
            <main id="main-content" className="workspace">
              <ReviewFileTree
                files={REVIEW_FILES}
                themeMode={resolvedTheme}
                themeId={themeId}
                uiFont={DEFAULT_SETTINGS.uiFont}
                width={splitWidth}
                selectedPath={selectedPath}
                onNavigate={navigate}
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
                  fileCount={REVIEW_FILES.length}
                  onChangeDiffStyle={setDiffStyle}
                />
                <ReviewCodePane
                  card={card}
                  shape={shape}
                  copy={copy}
                  diffStyle={diffStyle}
                  themeMode={resolvedTheme}
                  themeId={themeId}
                  uiFont={DEFAULT_SETTINGS.uiFont}
                  codeFont={DEFAULT_SETTINGS.codeFont}
                  onSelectedPath={setSelectedPath}
                  codeViewRef={codeViewRef}
                />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
