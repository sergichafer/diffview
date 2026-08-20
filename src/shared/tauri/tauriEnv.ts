/** True when running inside a Tauri webview (not plain Vite in the browser). */
export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    import.meta.env.TAURI_ENV_PLATFORM != null
  );
}

/**
 * Map Tauri 2 `TAURI_ENV_PLATFORM` values (rustc target triples) onto OS
 * names callers check: `darwin` → `macos`, `androideabi` → `android`.
 */
export function normalizeTauriPlatform(
  platform: string | null | undefined,
): string | null {
  if (typeof platform !== "string" || platform.length === 0) return null;
  if (platform === "darwin") return "macos";
  if (platform === "androideabi") return "android";
  return platform;
}

export function tauriPlatform(): string | null {
  if (!isTauriApp()) return null;
  return normalizeTauriPlatform(import.meta.env.TAURI_ENV_PLATFORM);
}

/** Custom window chrome replaces native decorations on desktop Tauri builds. */
export function useCustomWindowChrome(): boolean {
  if (!isTauriApp()) return false;
  const platform = tauriPlatform();
  return platform !== "ios" && platform !== "android";
}
