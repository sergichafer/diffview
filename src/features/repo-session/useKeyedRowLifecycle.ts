import { useEffect, useMemo, useRef } from "react";
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
 * Reset the active comparison row when its merge-base stamp changes; evict
 * rows whose keys have left the open set. Review and line-comments both
 * key session state this way.
 */
export function useKeyedRowLifecycle(
  activeKey: ComparisonKey | null,
  mergeBaseOid: string,
  openKeys: ReadonlySet<ComparisonKey>,
  storedKeys: readonly string[],
  dispatch: (action: KeyedRowAction) => void,
): void {
  const storedKeysRef = useRef(storedKeys);
  storedKeysRef.current = storedKeys;
  const prevStampRef = useRef<{ key: ComparisonKey | null; stamp: string }>({
    key: null,
    stamp: "",
  });

  useEffect(() => {
    if (!activeKey || !mergeBaseOid) return;
    const prev = prevStampRef.current;
    if (
      prev.key === activeKey &&
      prev.stamp !== mergeBaseOid &&
      prev.stamp !== ""
    ) {
      dispatch({ type: "reset-key", key: activeKey });
    }
    prevStampRef.current = { key: activeKey, stamp: mergeBaseOid };
  }, [activeKey, mergeBaseOid, dispatch]);

  useEffect(() => {
    for (const key of storedKeysRef.current) {
      if (!openKeys.has(key)) {
        dispatch({ type: "evict-key", key });
      }
    }
  }, [openKeys, dispatch]);
}
