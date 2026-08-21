import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  tauriPlatform,
  useCustomWindowChrome,
  usesNativeMacTitlebar,
} from "@/shared/tauri/tauriEnv";

function StrokeIcon({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`window-chrome-btn window-chrome-btn-stroke ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function WindowChrome({ title = "Diffview" }: { title?: string }) {
  const enabled = useCustomWindowChrome();
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focused, setFocused] = useState(true);
  const isMac = usesNativeMacTitlebar(tauriPlatform());

  useEffect(() => {
    if (!enabled) return;
    const win = getCurrentWebviewWindow();
    let cancelled = false;

    const sync = async () => {
      try {
        if (isMac) {
          const next = await win.isFullscreen();
          if (!cancelled) setFullscreen(next);
        } else {
          const next = await win.isMaximized();
          if (!cancelled) setMaximized(next);
        }
      } catch {
        /* ignore */
      }
    };

    void sync();
    const unlistenResize = win.onResized(() => void sync());
    const unlistenFocus = win.onFocusChanged(({ payload }) => {
      if (!cancelled) setFocused(payload);
    });

    return () => {
      cancelled = true;
      void unlistenResize.then((fn) => fn());
      void unlistenFocus.then((fn) => fn());
    };
  }, [enabled, isMac]);

  if (!enabled) return null;

  const chromeClass = `window-chrome${focused ? "" : " window-chrome-inactive"}${
    isMac && fullscreen ? " window-chrome-fullscreen" : ""
  }`;

  // macOS Overlay titlebar owns the traffic lights and Spaces fullscreen.
  // Windowed strip is a deep drag region; fullscreen is not movable.
  if (isMac) {
    return (
      <header
        className={`${chromeClass} window-chrome-mac`}
        data-tauri-drag-region={fullscreen ? undefined : "deep"}
      >
        <div className="window-chrome-center">
          <span className="window-chrome-title">{title}</span>
        </div>
      </header>
    );
  }

  return (
    <header className={chromeClass} data-tauri-drag-region="deep">
      <span className="window-chrome-title">{title}</span>
      <div className="window-chrome-controls window-chrome-controls-stroke">
        <StrokeIcon
          label="Minimize"
          onClick={() => void getCurrentWebviewWindow().minimize()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </StrokeIcon>
        <StrokeIcon
          label={maximized ? "Restore" : "Maximize"}
          onClick={() => void getCurrentWebviewWindow().toggleMaximize()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            {maximized ? (
              <>
                <rect x="8" y="8" width="10" height="10" rx="1" />
                <path d="M6 6h10v2H8v8H6z" />
              </>
            ) : (
              <rect x="5" y="5" width="14" height="14" rx="1" />
            )}
          </svg>
        </StrokeIcon>
        <StrokeIcon
          label="Close"
          className="window-chrome-btn-close"
          onClick={() => void getCurrentWebviewWindow().close()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </StrokeIcon>
      </div>
    </header>
  );
}
