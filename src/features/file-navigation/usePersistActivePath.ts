import { useEffect, useLayoutEffect, useRef } from "react";
import type { AppSettings } from "@/shared/types/app";
import { setActivePathForComparison } from "./activePathByRepo";
import type { ActiveFilePath } from "./types";

export interface UsePersistActivePathOptions {
  comparisonKey: string | null;
  selectedPath: ActiveFilePath;
  activePathByComparison: Record<string, string>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

/** Same-ref guard: skip write when the stored entry already matches. */
export function usePersistActivePath({
  comparisonKey,
  selectedPath,
  activePathByComparison,
  update,
}: UsePersistActivePathOptions): void {
  const activePathRef = useRef(activePathByComparison);
  const updateRef = useRef(update);

  useLayoutEffect(() => {
    activePathRef.current = activePathByComparison;
    updateRef.current = update;
  });

  useEffect(() => {
    if (comparisonKey == null || comparisonKey === "") return;
    const next = setActivePathForComparison(
      activePathRef.current,
      comparisonKey,
      selectedPath,
    );
    if (next === activePathRef.current) return;
    activePathRef.current = next;
    void updateRef.current({ activePathByComparison: next });
  }, [comparisonKey, selectedPath]);
}
