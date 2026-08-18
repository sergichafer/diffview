/** True when running inside a Tauri webview (not plain Vite in the browser). */
export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    import.meta.env.TAURI_ENV_PLATFORM != null
  );
}

export function tauriPlatform(): string | null {
  if (!isTauriApp()) return null;
  const platform = import.meta.env.TAURI_ENV_PLATFORM;
  return typeof platform === "string" ? platform : null;
}

/** Custom window chrome replaces native decorations on desktop Tauri builds. */
export function useCustomWindowChrome(): boolean {
  return isTauriApp() && tauriPlatform() !== "ios" && tauriPlatform() !== "android";
}
