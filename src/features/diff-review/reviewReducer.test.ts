import { describe, expect, test } from "bun:test";
import {
  emptyDiffReviewState,
  reviewReducer,
  type DiffReviewMap,
  type DiffReviewState,
} from "./reviewReducer";

const KEY = "/repo|main|feature";

function withViewed(
  paths: string[],
  expanded: string[] = [],
): DiffReviewState {
  return {
    viewedPaths: new Set(paths),
    expandedWhileViewed: new Set(expanded),
  };
}

function mapOf(row: DiffReviewState): DiffReviewMap {
  return { [KEY]: row };
}

describe("reviewReducer", () => {
  test("viewed-change adds a path", () => {
    const next = reviewReducer({}, {
      type: "viewed-change",
      key: KEY,
      path: "a.ts",
      viewed: true,
    });
    expect(next[KEY]?.viewedPaths.has("a.ts")).toBe(true);
  });

  test("viewed-change removes a path", () => {
    const next = reviewReducer(mapOf(withViewed(["a.ts"])), {
      type: "viewed-change",
      key: KEY,
      path: "a.ts",
      viewed: false,
    });
    expect(next[KEY]?.viewedPaths.has("a.ts")).toBe(false);
  });

  test("un-viewing clears expanded-while-viewed for that path", () => {
    const next = reviewReducer(mapOf(withViewed(["a.ts"], ["a.ts"])), {
      type: "viewed-change",
      key: KEY,
      path: "a.ts",
      viewed: false,
    });
    expect(next[KEY]?.expandedWhileViewed.has("a.ts")).toBe(false);
  });

  test("viewing a manually collapsed file clears the flip so it stays collapsed", () => {
    const flipped = reviewReducer({}, {
      type: "toggle-diff-collapsed",
      key: KEY,
      path: "a.ts",
    });
    expect(flipped[KEY]?.expandedWhileViewed.has("a.ts")).toBe(true);

    const viewed = reviewReducer(flipped, {
      type: "viewed-change",
      key: KEY,
      path: "a.ts",
      viewed: true,
    });
    expect(viewed[KEY]?.viewedPaths.has("a.ts")).toBe(true);
    expect(viewed[KEY]?.expandedWhileViewed.has("a.ts")).toBe(false);
  });

  test("toggle-diff-collapsed flips the collapse override", () => {
    const expanded = reviewReducer({}, {
      type: "toggle-diff-collapsed",
      key: KEY,
      path: "a.ts",
    });
    expect(expanded[KEY]?.expandedWhileViewed.has("a.ts")).toBe(true);

    const collapsed = reviewReducer(expanded, {
      type: "toggle-diff-collapsed",
      key: KEY,
      path: "a.ts",
    });
    expect(collapsed[KEY]?.expandedWhileViewed.has("a.ts")).toBe(false);
  });

  test("reset-key clears viewed and expanded sets", () => {
    const next = reviewReducer(mapOf(withViewed(["a.ts"], ["a.ts"])), {
      type: "reset-key",
      key: KEY,
    });
    expect(next[KEY]?.viewedPaths.size).toBe(0);
    expect(next[KEY]?.expandedWhileViewed.size).toBe(0);
    expect(next[KEY]).toBe(emptyDiffReviewState);
  });

  test("evict-key removes a closed comparison", () => {
    const next = reviewReducer(mapOf(withViewed(["a.ts"])), {
      type: "evict-key",
      key: KEY,
    });
    expect(KEY in next).toBe(false);
  });
});
