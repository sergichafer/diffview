import {
  createContext,
  use,
  useCallback,
  useReducer,
  type ReactNode,
} from "react";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import { useRepoSession } from "@/features/repo-session/context";
import {
  useKeyedRowLifecycle,
  useOpenComparisonKeys,
} from "@/features/repo-session/useKeyedRowLifecycle";
import {
  emptyDiffReviewState,
  reviewReducer,
  type DiffReviewMap,
} from "./reviewReducer";

export interface UseDiffReviewOptions {
  activeKey: ComparisonKey | null;
  /** Merge-base OID for the active row. Reset review when it changes. */
  mergeBaseOid: string;
  /** Comparison keys currently open. Evict review state for closed rows. */
  openKeys: ReadonlySet<ComparisonKey>;
}

export function useDiffReviewState({
  activeKey,
  mergeBaseOid,
  openKeys,
}: UseDiffReviewOptions) {
  const [map, dispatch] = useReducer(reviewReducer, {} as DiffReviewMap);
  useKeyedRowLifecycle(
    activeKey,
    mergeBaseOid,
    openKeys,
    Object.keys(map),
    dispatch,
  );

  const activeState =
    activeKey != null
      ? (map[activeKey] ?? emptyDiffReviewState)
      : emptyDiffReviewState;

  const handleViewedChange = useCallback(
    (path: string, viewed: boolean) => {
      if (!activeKey) return;
      dispatch({ type: "viewed-change", key: activeKey, path, viewed });
    },
    [activeKey],
  );

  const handleToggleDiffCollapsed = useCallback(
    (path: string) => {
      if (!activeKey) return;
      dispatch({ type: "toggle-diff-collapsed", key: activeKey, path });
    },
    [activeKey],
  );

  return {
    viewedPaths: activeState.viewedPaths as ReadonlySet<string>,
    expandedWhileViewed: activeState.expandedWhileViewed as ReadonlySet<string>,
    handleViewedChange,
    handleToggleDiffCollapsed,
  };
}

export type DiffReviewValue = ReturnType<typeof useDiffReviewState>;

const DiffReviewContext = createContext<DiffReviewValue | null>(null);

export function useDiffReview(): DiffReviewValue {
  const ctx = use(DiffReviewContext);
  if (!ctx) {
    throw new Error("useDiffReview must be used within DiffReviewProvider");
  }
  return ctx;
}

interface DiffReviewProviderProps {
  children: ReactNode;
}

/**
 * Owns viewed/collapse review state keyed by ComparisonKey. Resets the active
 * row when its merge-base stamp changes; evicts closed comparisons.
 */
export function DiffReviewProvider({ children }: DiffReviewProviderProps) {
  const { activeKey, activeMergeBase } = useRepoSession();
  const openKeys = useOpenComparisonKeys();
  const review = useDiffReviewState({
    activeKey,
    mergeBaseOid: activeMergeBase,
    openKeys,
  });
  return (
    <DiffReviewContext.Provider value={review}>
      {children}
    </DiffReviewContext.Provider>
  );
}
