import "@fontsource-variable/inter/opsz.css";
import "@fontsource/syne/600.css";
import DOMPurify from "dompurify";
import parse from "html-react-parser";
import { marked } from "marked";
import {
  StrictMode,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AppChromeShell } from "@/features/window-chrome/AppChromeShell";
import { useAppFonts } from "@/design/fonts/useAppFonts";
import { useAppTheme, useResolvedTheme } from "@/design/theme/useResolvedTheme";
import { api } from "@/shared/tauri/api";
import { previewKind, type PreviewKind } from "@/features/diff-workspace/preview";
import { resolveWorkingRepoPath } from "@/features/branch-compare/repoPaths";
import { loadSettings } from "@/features/settings/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/shared/types/app";
import "@/design/tokens.css";
import "@/design/a11y.css";
import "@/features/window-chrome/window-chrome.css";
import "./preview.css";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; kind: "markdown"; content: ReturnType<typeof parse> }
  | { status: "ready"; kind: "image" | "html"; assetUrl: string };

type PreviewAction =
  | { type: "load" }
  | { type: "error"; message: string }
  | { type: "ready-markdown"; content: ReturnType<typeof parse> }
  | { type: "ready-asset"; kind: "image" | "html"; assetUrl: string };

function previewReducer(_state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case "load":
      return { status: "loading" };
    case "error":
      return { status: "error", message: action.message };
    case "ready-markdown":
      return { status: "ready", kind: "markdown", content: action.content };
    case "ready-asset":
      return { status: "ready", kind: action.kind, assetUrl: action.assetUrl };
  }
}

function PreviewApp() {
  const [state, dispatch] = useReducer(previewReducer, { status: "loading" });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") ?? "";
  const repoPath = params.get("repoPath") ?? "";
  const kind: PreviewKind = previewKind(path);
  const fileName = path.split("/").pop() ?? path;
  const title = fileName ? `Preview: ${fileName}` : "Preview";

  // Match main-window theme and font tokens so chrome is the same.
  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const resolvedTheme = useResolvedTheme(settings.themeMode);
  useAppTheme(resolvedTheme, settings.themeId);
  useAppFonts(settings.uiFont, settings.codeFont);

  useEffect(() => {
    if (!path || !repoPath) {
      dispatch({
        type: "error",
        message: "Missing file path or repository.",
      });
      return;
    }

    dispatch({ type: "load" });
    let cancelled = false;

    if (kind === "markdown") {
      api
        .readWorkingFile(repoPath, path)
        .then((content) => {
          if (cancelled) return;
          const rendered = marked.parse(content, { async: false }) as string;
          const sanitized = DOMPurify.sanitize(rendered);
          dispatch({ type: "ready-markdown", content: parse(sanitized) });
        })
        .catch((e) => {
          if (cancelled) return;
          dispatch({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        });
    } else {
      const absolute = resolveWorkingRepoPath(repoPath, path);
      if (cancelled) return;
      dispatch({
        type: "ready-asset",
        kind,
        assetUrl: convertFileSrc(absolute),
      });
    }

    return () => {
      cancelled = true;
    };
  }, [path, repoPath, kind]);

  let content: ReactNode = null;
  if (state.status === "error") {
    content = (
      <main id="main-content" className="preview-main">
        <p className="preview-error" aria-live="assertive">
          <span aria-hidden="true">⚠ </span>
          Error: {state.message}
        </p>
      </main>
    );
  } else if (state.status === "loading") {
    content = (
      <main id="main-content" className="preview-main">
        <p className="preview-loading" aria-live="polite">
          Loading preview…
        </p>
      </main>
    );
  } else if (state.kind === "image") {
    content = (
      <main id="main-content" className="preview-main preview-main-media">
        <img className="preview-image" src={state.assetUrl} alt={path} />
      </main>
    );
  } else if (state.kind === "html") {
    content = (
      <main id="main-content" className="preview-main preview-main-frame">
        {/* Opaque-origin sandbox: scripts run, but the framed page cannot
            read other files through the asset protocol. */}
        <iframe
          className="preview-frame"
          src={state.assetUrl}
          sandbox="allow-scripts"
          title={path ? `Preview of ${path}` : "File preview"}
        />
      </main>
    );
  } else if (state.kind === "markdown") {
    content = (
      <main id="main-content" className="preview-main">
        <article
          className="preview-document"
          aria-label={path ? `Preview of ${path}` : "File preview"}
        >
          {state.content}
        </article>
      </main>
    );
  }

  return (
    <div className="preview-root">
      <AppChromeShell title={title} />
      {content}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
