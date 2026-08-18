import {
  Suspense,
  use,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BranchWorkspace } from "@/features/diff-workspace/BranchWorkspace";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { TopBar } from "./TopBar";
import { AppChromeShell } from "@/features/window-chrome/AppChromeShell";
import { WelcomeScreen } from "./WelcomeScreen";
import { useChromeGlow } from "@/design/useChromeGlow";
import { DiffReviewProvider } from "@/features/diff-review/DiffReviewProvider";
import { useAppFonts } from "@/design/fonts/useAppFonts";
import { useAppTheme, useResolvedTheme } from "@/design/theme/useResolvedTheme";
import { useSettings } from "@/features/settings/useSettings";
import { useSplitResize } from "@/shared/split-layout/useSplitResize";
import { loadStartup } from "./startup";
import {
  WORKSPACES_MAX_WIDTH,
  WORKSPACES_MIN_WIDTH,
} from "@/shared/split-layout/splitter";
import { DEFAULT_SETTINGS, type AppSettings } from "@/shared/types/app";
import { RepoSessionProvider } from "@/features/repo-session/RepoSessionProvider";
import { useRepoSession } from "@/features/repo-session/context";
import "./App.css";

interface AppBodyProps {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  resolvedTheme: "light" | "dark";
  splitWidth: number;
  workspacesWidth: number;
  splitterDragging: boolean;
  splitterSettling: boolean;
  onSplitterPointerDown: ReturnType<
    typeof useSplitResize
  >["onSplitterPointerDown"];
  onSplitterKeyDown: ReturnType<typeof useSplitResize>["onSplitterKeyDown"];
  workspacesSplitterDragging: boolean;
  workspacesSplitterSettling: boolean;
  onWorkspacesSplitterPointerDown: ReturnType<
    typeof useSplitResize
  >["onSplitterPointerDown"];
  onWorkspacesSplitterKeyDown: ReturnType<
    typeof useSplitResize
  >["onSplitterKeyDown"];
}

function LoadingShell({
  themeMode = DEFAULT_SETTINGS.themeMode,
  themeId = DEFAULT_SETTINGS.themeId,
}: {
  themeMode?: AppSettings["themeMode"];
  themeId?: AppSettings["themeId"];
}) {
  const resolvedTheme = useResolvedTheme(themeMode);
  useAppTheme(resolvedTheme, themeId);
  return (
    <div
      className="app is-loading"
      data-theme={resolvedTheme}
      data-palette={themeId}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppChromeShell />
      <main id="main-content">
        <p aria-live="polite">Loading…</p>
      </main>
    </div>
  );
}

function AppBody({
  settings,
  update,
  resolvedTheme,
  splitWidth,
  workspacesWidth,
  splitterDragging,
  splitterSettling,
  onSplitterPointerDown,
  onSplitterKeyDown,
  workspacesSplitterDragging,
  workspacesSplitterSettling,
  onWorkspacesSplitterPointerDown,
  onWorkspacesSplitterKeyDown,
}: AppBodyProps) {
  const { workspaces } = useRepoSession();
  const [showSettings, setShowSettings] = useState(false);
  const [paletteOpenRequest, setPaletteOpenRequest] = useState(0);
  const appRef = useRef<HTMLDivElement>(null);

  useChromeGlow(appRef);

  const settingsPortal =
    showSettings &&
    appRef.current &&
    createPortal(
      <SettingsPanel
        settings={settings}
        onClose={() => setShowSettings(false)}
        onChange={(patch) => void update(patch)}
      />,
      appRef.current,
    );

  const shell = (body: ReactNode) => (
    <div
      ref={appRef}
      className="app"
      data-theme={resolvedTheme}
      data-palette={settings.themeId}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppChromeShell />
      {body}
    </div>
  );

  if (workspaces.length === 0) {
    return shell(
      <>
        <WelcomeScreen
          settings={settings}
          onSetLaunchMode={(launchMode) =>
            void update({ launchMode, launchPreferenceSet: true })
          }
          onOpenSettings={() => setShowSettings(true)}
        />
        {settingsPortal}
      </>,
    );
  }

  const topBar = (
    <TopBar
      onOpenSettings={() => setShowSettings(true)}
      paletteOpenRequest={paletteOpenRequest}
    />
  );

  return shell(
    <>
      <BranchWorkspace
        resolvedTheme={resolvedTheme}
        splitWidth={splitWidth}
        workspacesWidth={workspacesWidth}
        settings={settings}
        updateSettings={update}
        splitterDragging={splitterDragging}
        splitterSettling={splitterSettling}
        onSplitterPointerDown={onSplitterPointerDown}
        onSplitterKeyDown={onSplitterKeyDown}
        workspacesSplitterDragging={workspacesSplitterDragging}
        workspacesSplitterSettling={workspacesSplitterSettling}
        onWorkspacesSplitterPointerDown={onWorkspacesSplitterPointerDown}
        onWorkspacesSplitterKeyDown={onWorkspacesSplitterKeyDown}
        onDiffStyleChange={(diffStyle) => void update({ diffStyle })}
        onRequestPalette={() => setPaletteOpenRequest((n) => n + 1)}
        topBar={topBar}
      />
      {settingsPortal}
    </>,
  );
}

function AppReady() {
  const startup = use(loadStartup());
  if (startup.openError) {
    console.error("Startup open failed:", startup.openError);
  }

  const { settings, update } = useSettings(startup.settings);
  const resolvedTheme = useResolvedTheme(settings.themeMode);
  useAppTheme(resolvedTheme, settings.themeId);
  useAppFonts(settings.uiFont, settings.codeFont);
  const persistSplitWidth = useCallback(
    (width: number) => {
      void update({ splitWidth: width });
    },
    [update],
  );
  const persistWorkspacesWidth = useCallback(
    (width: number) => {
      void update({ workspacesWidth: width });
    },
    [update],
  );
  const {
    splitWidth,
    dragging: splitterDragging,
    settling: splitterSettling,
    onSplitterPointerDown,
    onSplitterKeyDown,
  } = useSplitResize(settings.splitWidth, persistSplitWidth);
  const {
    splitWidth: workspacesWidth,
    dragging: workspacesSplitterDragging,
    settling: workspacesSplitterSettling,
    onSplitterPointerDown: onWorkspacesSplitterPointerDown,
    onSplitterKeyDown: onWorkspacesSplitterKeyDown,
  } = useSplitResize(settings.workspacesWidth, persistWorkspacesWidth, {
    minWidth: WORKSPACES_MIN_WIDTH,
    maxWidth: WORKSPACES_MAX_WIDTH,
  });

  return (
    <RepoSessionProvider
      settings={settings}
      update={update}
      opened={startup.opened}
      openedWorkspaces={startup.openedWorkspaces}
    >
      <DiffReviewProvider>
        <AppBody
          settings={settings}
          update={update}
          resolvedTheme={resolvedTheme}
          splitWidth={splitWidth}
          workspacesWidth={workspacesWidth}
          splitterDragging={splitterDragging}
          splitterSettling={splitterSettling}
          onSplitterPointerDown={onSplitterPointerDown}
          onSplitterKeyDown={onSplitterKeyDown}
          workspacesSplitterDragging={workspacesSplitterDragging}
          workspacesSplitterSettling={workspacesSplitterSettling}
          onWorkspacesSplitterPointerDown={onWorkspacesSplitterPointerDown}
          onWorkspacesSplitterKeyDown={onWorkspacesSplitterKeyDown}
        />
      </DiffReviewProvider>
    </RepoSessionProvider>
  );
}

function App() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <AppReady />
    </Suspense>
  );
}

export default App;
