import { LogicalPosition } from "@tauri-apps/api/dpi";

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

/** Origin of the AppKit cluster in the 28px Overlay strip. Keep in sync with tauri.macos.conf.json. */
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 16, y: 8 } as const;

export type DesktopWindowChromeOptions = {
  decorations: boolean;
  hiddenTitle: boolean;
  titleBarStyle?: "overlay";
  trafficLightPosition?: LogicalPosition;
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
      trafficLightPosition: new LogicalPosition(
        MAC_TRAFFIC_LIGHT_POSITION.x,
        MAC_TRAFFIC_LIGHT_POSITION.y,
      ),
    };
  }
  return { decorations: false, hiddenTitle: false };
}
