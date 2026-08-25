import {
  createContext,
  use,
  useCallback,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { SelectedLineRange } from "@pierre/diffs";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import { useRepoSession } from "@/features/repo-session/context";
import {
  useKeyedRowLifecycle,
  useOpenComparisonKeys,
} from "@/features/repo-session/useKeyedRowLifecycle";
import {
  EMPTY_PATH_COMMENTS,
  savedCommentCount,
  type PathComments,
} from "./commentMeta";
import {
  commentsReducer,
  emptyCommentsStore,
} from "./commentsReducer";

export interface UseLineCommentsOptions {
  activeKey: ComparisonKey | null;
  /** Merge-base OID for the active row. Reset comments when it changes. */
  mergeBaseOid: string;
  /** Comparison keys currently open. Evict comments for closed rows. */
  openKeys: ReadonlySet<ComparisonKey>;
}

export function useLineCommentsState({
  activeKey,
  mergeBaseOid,
  openKeys,
}: UseLineCommentsOptions) {
  const [store, dispatch] = useReducer(commentsReducer, emptyCommentsStore);
  const nextKeyRef = useRef(0);
  const keyedAction = useKeyedRowLifecycle(
    activeKey,
    mergeBaseOid,
    openKeys,
    Object.keys(store.map),
  );
  if (keyedAction) dispatch(keyedAction);

  const pathComments: PathComments =
    activeKey != null
      ? (store.map[activeKey] ?? EMPTY_PATH_COMMENTS)
      : EMPTY_PATH_COMMENTS;

  const startDraft = useCallback(
    (path: string, range: SelectedLineRange) => {
      if (!activeKey) return;
      dispatch({
        type: "start-draft",
        key: activeKey,
        path,
        range,
        nextKey: `c-${nextKeyRef.current++}`,
      });
    },
    [activeKey],
  );

  const saveComment = useCallback(
    (
      path: string,
      commentKey: string,
      message: string,
      snippet: string,
      language: string,
    ) => {
      if (!activeKey) return;
      dispatch({
        type: "save",
        key: activeKey,
        path,
        commentKey,
        message,
        snippet,
        language,
      });
    },
    [activeKey],
  );

  const beginEdit = useCallback(
    (path: string, commentKey: string) => {
      if (!activeKey) return;
      dispatch({ type: "begin-edit", key: activeKey, path, commentKey });
    },
    [activeKey],
  );

  const deleteComment = useCallback(
    (path: string, commentKey: string) => {
      if (!activeKey) return;
      dispatch({ type: "delete", key: activeKey, path, commentKey });
    },
    [activeKey],
  );

  return {
    pathComments,
    commentsRev: store.commentsRev,
    savedCommentCount: savedCommentCount(pathComments),
    startDraft,
    saveComment,
    beginEdit,
    deleteComment,
  };
}

export type LineCommentsValue = ReturnType<typeof useLineCommentsState>;

const LineCommentsContext = createContext<LineCommentsValue | null>(null);

export function useLineComments(): LineCommentsValue {
  const ctx = use(LineCommentsContext);
  if (!ctx) {
    throw new Error("useLineComments must be used within LineCommentsProvider");
  }
  return ctx;
}

interface LineCommentsProviderProps {
  children: ReactNode;
}

/**
 * Owns session line comments keyed by ComparisonKey. Resets the active row
 * when its merge-base stamp changes; evicts closed comparisons.
 */
export function LineCommentsProvider({ children }: LineCommentsProviderProps) {
  const { activeKey, activeMergeBase } = useRepoSession();
  const openKeys = useOpenComparisonKeys();
  const comments = useLineCommentsState({
    activeKey,
    mergeBaseOid: activeMergeBase,
    openKeys,
  });
  return (
    <LineCommentsContext.Provider value={comments}>
      {children}
    </LineCommentsContext.Provider>
  );
}
