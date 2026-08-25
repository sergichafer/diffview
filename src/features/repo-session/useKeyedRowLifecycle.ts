import { useMemo, useState } from "react";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import { useRepoSession } from "./context";

export type KeyedRowAction =
  | { type: "reset-key"; key: ComparisonKey }
  | { type: "evict-key"; key: ComparisonKey };

/** Comparison keys currently open in the session tree. */
export function useOpenComparisonKeys(): ReadonlySet<ComparisonKey> {
  const { comparisons } = useRepoSession();
  return useMemo(() => new Set(Object.keys(comparisons)), [comparisons]);
}

/**
 * Next reset/evict action for a ComparisonKey-keyed session store. Callers
 * dispatch during render (at most one action per pass) so closed rows drain
 * across frames.
 */
export function useKeyedRowLifecycle(
  activeKey: ComparisonKey | null,
  mergeBaseOid: string,
  openKeys: ReadonlySet<ComparisonKey>,
  storedKeys: readonly string[],
): KeyedRowAction | null {
  const [seen, setSeen] = useState<{
    key: ComparisonKey | null;
    stamp: string;
  }>({ key: null, stamp: "" });

  if (activeKey && mergeBaseOid) {
    if (seen.key !== activeKey || seen.stamp !== mergeBaseOid) {
      const reset =
        seen.key === activeKey &&
        seen.stamp !== mergeBaseOid &&
        seen.stamp !== "";
      setSeen({ key: activeKey, stamp: mergeBaseOid });
      if (reset) return { type: "reset-key", key: activeKey };
    }
  }

  for (const key of storedKeys) {
    if (!openKeys.has(key)) {
      return { type: "evict-key", key };
    }
  }
  return null;
}
