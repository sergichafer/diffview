import { invoke } from "@tauri-apps/api/core";
import type { StartupSnapshot as SeamStartupSnapshot } from "@/shared/types/generated/types";
import { loadSettings, normalizeAppSettings } from "@/features/settings/settings";
import { isTauriApp } from "@/shared/tauri/tauriEnv";
import type { AppSettings, OpenRepoResult } from "@/shared/types/app";

/**
 * FE startup payload. Path resolution is Rust-only
 * (`startup::resolve_bootstrap_paths`); this module only consumes
 * `get_startup_state` and normalizes theme/font ids.
 */
export interface StartupSnapshot {
  settings: AppSettings;
  opened: OpenRepoResult | null;
  /** All repos opened at startup (persisted tree + bootstrap/CLI), for cold restore. */
  openedWorkspaces: OpenRepoResult[];
  openError: string | null;
  /** CLI-opened repos in argument order. Empty when launch was not from CLI. */
  cliOpened: OpenRepoResult[];
}

async function fetchStartup(): Promise<StartupSnapshot> {
  if (!isTauriApp()) {
    return {
      settings: await loadSettings(),
      opened: null,
      openedWorkspaces: [],
      openError: null,
      cliOpened: [],
    };
  }

  const seam = await invoke<SeamStartupSnapshot>("get_startup_state");
  return {
    settings: normalizeAppSettings(seam.settings),
    opened: seam.opened ?? null,
    openedWorkspaces: seam.openedWorkspaces ?? [],
    openError: seam.openError ?? null,
    cliOpened: seam.cliOpened ?? [],
  };
}

let startupPromise: Promise<StartupSnapshot> | null = null;

export function loadStartup(): Promise<StartupSnapshot> {
  if (startupPromise == null) {
    startupPromise = fetchStartup();
  }
  return startupPromise;
}
