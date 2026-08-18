import { useCallback, useEffect, useRef, useState } from "react";
import { saveSettings } from "./settings";
import type { AppSettings } from "@/shared/types/app";

/**
 * Overlapping patches compose (`setSettings(prev => ...)`).
 * Resolves when the merge is scheduled, not after disk. Persist is
 * fire-and-forget from an effect (`void saveSettings`).
 */
export function useSettings(initial: AppSettings) {
  const [settings, setSettings] = useState(initial);
  const lastPersistedRef = useRef(initial);

  useEffect(() => {
    if (settings === lastPersistedRef.current) return;
    lastPersistedRef.current = settings;
    void saveSettings(settings);
  }, [settings]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}
