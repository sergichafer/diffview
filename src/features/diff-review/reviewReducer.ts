import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";

export type DiffReviewState = {
  viewedPaths: Set<string>;
  /**
   * Flips collapse off the viewed default (viewed → collapsed, unviewed →
   * expanded). Listed viewed files stay expanded; listed unviewed files are
   * collapsed.
   */
  expandedWhileViewed: Set<string>;
};

export type DiffReviewAction =
  | { type: "reset-key"; key: ComparisonKey }
  | { type: "evict-key"; key: ComparisonKey }
  | { type: "viewed-change"; key: ComparisonKey; path: string; viewed: boolean }
  | { type: "toggle-diff-collapsed"; key: ComparisonKey; path: string };

export type DiffReviewMap = Record<ComparisonKey, DiffReviewState>;

export const emptyDiffReviewState: DiffReviewState = {
  viewedPaths: new Set(),
  expandedWhileViewed: new Set(),
};

function reduceRow(
  state: DiffReviewState,
  action: Extract<
    DiffReviewAction,
    { type: "viewed-change" | "toggle-diff-collapsed" }
  >,
): DiffReviewState {
  switch (action.type) {
    case "viewed-change": {
      const viewedPaths = new Set(state.viewedPaths);
      if (action.viewed) viewedPaths.add(action.path);
      else viewedPaths.delete(action.path);

      let expandedWhileViewed = state.expandedWhileViewed;
      if (state.expandedWhileViewed.has(action.path)) {
        expandedWhileViewed = new Set(state.expandedWhileViewed);
        expandedWhileViewed.delete(action.path);
      }

      return { ...state, viewedPaths, expandedWhileViewed };
    }
    case "toggle-diff-collapsed": {
      const expandedWhileViewed = new Set(state.expandedWhileViewed);
      if (expandedWhileViewed.has(action.path)) {
        expandedWhileViewed.delete(action.path);
      } else {
        expandedWhileViewed.add(action.path);
      }
      return { ...state, expandedWhileViewed };
    }
  }
}

export function reviewReducer(
  state: DiffReviewMap,
  action: DiffReviewAction,
): DiffReviewMap {
  switch (action.type) {
    case "evict-key": {
      if (!(action.key in state)) return state;
      const next = { ...state };
      delete next[action.key];
      return next;
    }
    case "reset-key":
      return { ...state, [action.key]: emptyDiffReviewState };
    case "viewed-change":
    case "toggle-diff-collapsed": {
      const current = state[action.key] ?? emptyDiffReviewState;
      const nextRow = reduceRow(current, action);
      if (nextRow === current) return state;
      return { ...state, [action.key]: nextRow };
    }
  }
}
