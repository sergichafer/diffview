import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriPlatform, useCustomWindowChrome } from "@/shared/tauri/tauriEnv";

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

/** Hover-reveal glyphs live in window-chrome.css. Max swaps zoom vs contract. */
function MacTraffic({
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="window-chrome-traffic">
      <button
        type="button"
        className="window-chrome-dot window-chrome-dot-close"
        aria-label="Close"
        title="Close"
        onClick={onClose}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M3.6 3.6l4.8 4.8M8.4 3.6L3.6 8.4" />
        </svg>
      </button>
      <button
        type="button"
        className="window-chrome-dot window-chrome-dot-min"
        aria-label="Minimize"
        title="Minimize"
        onClick={onMinimize}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M2.8 6h6.4" />
        </svg>
      </button>
      <button
        type="button"
        className="window-chrome-dot window-chrome-dot-max"
        aria-label={maximized ? "Restore" : "Zoom"}
        title={maximized ? "Restore" : "Zoom"}
        onClick={onToggleMaximize}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          {maximized ? (
            <>
              <path d="M9 3 6.4 5.6" />
              <path d="M8.4 5.6H6.4V3.6" />
              <path d="M3 9l2.6-2.6" />
              <path d="M3.6 6.4h2v2" />
            </>
          ) : (
            <>
              <path d="M5.2 6.8 8.9 3.1" />
              <path d="M8.9 5.3V3.1H6.7" />
              <path d="M6.8 5.2 3.1 8.9" />
              <path d="M3.1 6.7V8.9h2.2" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

export function WindowChrome({ title = "Diffview" }: { title?: string }) {
  const enabled = useCustomWindowChrome();
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const isMac = tauriPlatform() === "macos";

  useEffect(() => {
    if (!enabled) return;
    const win = getCurrentWebviewWindow();
    let cancelled = false;

    const sync = async () => {
      try {
        const next = await win.isMaximized();
        if (!cancelled) setMaximized(next);
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
  }, [enabled]);

  if (!enabled) return null;

  const win = getCurrentWebviewWindow();
  const minimize = () => void win.minimize();
  const toggleMaximize = () => void win.toggleMaximize();
  const close = () => void win.close();

  const chromeClass = `window-chrome${focused ? "" : " window-chrome-inactive"}`;

  // Deep drag region: buttons opt out; Tauri owns double-click maximize
  // (macOS cancel-on-move). No manual handlers.
  if (isMac) {
    return (
      <header
        className={`${chromeClass} window-chrome-mac`}
        data-tauri-drag-region="deep"
      >
        <MacTraffic
          maximized={maximized}
          onMinimize={minimize}
          onToggleMaximize={toggleMaximize}
          onClose={close}
        />
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
        <StrokeIcon label="Minimize" onClick={minimize}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </StrokeIcon>
        <StrokeIcon
          label={maximized ? "Restore" : "Maximize"}
          onClick={toggleMaximize}
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
          onClick={close}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </StrokeIcon>
      </div>
    </header>
  );
}
