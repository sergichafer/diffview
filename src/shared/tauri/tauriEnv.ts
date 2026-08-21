/** True when running inside a Tauri webview (not plain Vite in the browser). */
export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    import.meta.env.TAURI_ENV_PLATFORM != null
  );
}

/** Tauri 2 `TAURI_ENV_PLATFORM`: `linux`, `windows`, `darwin`, `android`, `ios`. */
export function tauriPlatform(): string | null {
  if (!isTauriApp()) return null;
  const platform = import.meta.env.TAURI_ENV_PLATFORM;
  return typeof platform === "string" ? platform : null;
}

/** Desktop Tauri header: drag region and wordmark; caption buttons on Windows/Linux. */
export function useCustomWindowChrome(): boolean {
  return isTauriApp() && tauriPlatform() !== "ios" && tauriPlatform() !== "android";
}

/** AppKit traffic lights via Overlay titlebar (VS Code / Zed style). */
export function usesNativeMacTitlebar(
  platform: string | null = tauriPlatform(),
): boolean {
  return platform === "darwin";
}

export type DesktopWindowChromeOptions = {
  decorations: boolean;
  hiddenTitle: boolean;
  titleBarStyle?: "overlay";
};

/** Create-window options so preview matches the main window on each OS. */
export function desktopWindowChromeOptions(
  platform: string | null = tauriPlatform(),
): DesktopWindowChromeOptions {
  if (usesNativeMacTitlebar(platform)) {
    return {
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "overlay",
    };
  }
  return { decorations: false, hiddenTitle: false };
}
