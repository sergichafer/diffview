import { describe, expect, test } from "bun:test";
import { DEFAULT_CODE_VIEW_FILE_METRICS } from "@pierre/diffs";
import type { CodeView } from "@pierre/diffs";
import {
  laidOutDiffItemIds,
  resolveActiveDiffPathFromScroll,
} from "./activePath";
import {
  applyCommentAnnotations,
  applyEditSession,
  applyViewedCollapse,
  collapseItemVersion,
} from "./useDiffWorkspace";

describe("resolveActiveDiffPathFromScroll", () => {
  test("returns the item whose band contains the headline line", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 100;
        if (id === "b.ts") return 300;
        return null;
      },
      getScrollHeight: () => 500,
    } as unknown as CodeView;

    expect(
      resolveActiveDiffPathFromScroll(viewer, ["a.ts", "b.ts"], 100 + header - 1),
    ).toBe("a.ts");
    expect(
      resolveActiveDiffPathFromScroll(viewer, ["a.ts", "b.ts"], 300 + header),
    ).toBe("b.ts");
  });

  test("returns null for empty item list", () => {
    const viewer = {
      getTopForItem: () => 0,
      getScrollHeight: () => 0,
    } as unknown as CodeView;
    expect(resolveActiveDiffPathFromScroll(viewer, [], 0)).toBeNull();
  });

  test("tracks tall items when virtual tops span large height", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const tallItemHeight = 500;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 0;
        if (id === "big.bin") return 200;
        if (id === "b.ts") return 200 + header + tallItemHeight;
        return null;
      },
      getScrollHeight: () => 2000,
    } as unknown as CodeView;

    const ids = ["a.ts", "big.bin", "b.ts"];
    const midScroll = 200 + header + tallItemHeight / 2;
    expect(resolveActiveDiffPathFromScroll(viewer, ids, midScroll)).toBe("big.bin");
  });

  test("ignores React ids that Pierre has not laid out yet", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 0;
        if (id === "b.ts") return 400;
        // c.ts is in React displayItemIds but not in CodeView yet
        return undefined;
      },
      getScrollHeight: () => 800,
    } as unknown as CodeView;

    const ids = ["a.ts", "b.ts", "c.ts"];
    expect(laidOutDiffItemIds(viewer, ids)).toEqual(["a.ts", "b.ts"]);
    // Regression: previously a missing next-top for c.ts made a.ts's band
    // extend to contentEnd, so mid-scroll still reported a.ts.
    expect(resolveActiveDiffPathFromScroll(viewer, ids, 400 + header)).toBe("b.ts");
  });

  test("binary-searches a large laid-out list", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const itemHeight = 100;
    const count = 2000;
    const ids = Array.from({ length: count }, (_, i) => `f${i}.ts`);
    const tops = new Map(ids.map((id, i) => [id, i * itemHeight]));
    const viewer = {
      getTopForItem: (id: string) => tops.get(id) ?? null,
      getScrollHeight: () => count * itemHeight,
    } as unknown as CodeView;

    expect(resolveActiveDiffPathFromScroll(viewer, ids, 0)).toBe("f0.ts");
    expect(
      resolveActiveDiffPathFromScroll(viewer, ids, 1234 * itemHeight + header),
    ).toBe("f1234.ts");
    expect(
      resolveActiveDiffPathFromScroll(
        viewer,
        ids,
        (count - 1) * itemHeight + header,
      ),
    ).toBe(`f${count - 1}.ts`);
  });

  test("sparse trailing nulls still track the last laid-out band", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    // Keep item bands taller than the sticky header so top+header stays inside the band.
    const itemHeight = header * 3;
    const laidOut = 50;
    const total = 80;
    const ids = Array.from({ length: total }, (_, i) => `f${i}.ts`);
    const viewer = {
      getTopForItem: (id: string) => {
        const n = Number(id.slice(1, -3));
        return n < laidOut ? n * itemHeight : null;
      },
      getScrollHeight: () => laidOut * itemHeight,
    } as unknown as CodeView;

    expect(
      resolveActiveDiffPathFromScroll(
        viewer,
        ids,
        (laidOut - 1) * itemHeight + header,
      ),
    ).toBe(`f${laidOut - 1}.ts`);
    expect(
      resolveActiveDiffPathFromScroll(viewer, ids, 10 * itemHeight + header),
    ).toBe("f10.ts");
  });
});

describe("applyViewedCollapse", () => {
  test("collapses viewed paths unless expanded", () => {
    const items = [
      { id: "a.ts", type: "diff" as const, fileDiff: {} as never },
      { id: "b.ts", type: "diff" as const, fileDiff: {} as never },
    ];
    const viewed = new Set(["a.ts"]);
    const expanded = new Set<string>();

    const result = applyViewedCollapse(items, viewed, expanded);
    expect(result[0]?.collapsed).toBe(true);
    expect(result[0]?.version).toBe(1);
    expect(result[1]?.collapsed).toBe(false);
    expect(result[1]?.version).toBe(0);
    expect(collapseItemVersion("a.ts", viewed, expanded)).toBe(1);
    expect(collapseItemVersion("a.ts", viewed, new Set(["a.ts"]))).toBe(2);

    const expandedResult = applyViewedCollapse(
      items,
      viewed,
      new Set(["a.ts"]),
    );
    expect(expandedResult[0]?.collapsed).toBe(false);
    expect(expandedResult[0]?.version).toBe(2);
  });

  test("collapses unviewed paths that were manually collapsed", () => {
    const items = [
      { id: "a.ts", type: "diff" as const, fileDiff: {} as never },
      { id: "b.ts", type: "diff" as const, fileDiff: {} as never },
    ];
    const viewed = new Set<string>();
    const flipped = new Set(["a.ts"]);

    const result = applyViewedCollapse(items, viewed, flipped);
    expect(result[0]?.collapsed).toBe(true);
    expect(result[0]?.version).toBe(1);
    expect(result[1]?.collapsed).toBe(false);
    expect(result[1]?.version).toBe(0);
    expect(collapseItemVersion("a.ts", viewed, flipped)).toBe(1);
    expect(collapseItemVersion("b.ts", viewed, flipped)).toBe(0);
  });
});

describe("applyEditSession", () => {
  test("folds edit into collapse version and preserves identity when unchanged", () => {
    // Inputs are collapse-versioned (0/1/2) from applyViewedCollapse, not
    // previously edit-folded. applyEditSession is always applied on that layer.
    const items = [
      {
        id: "a.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        edit: false,
        version: 1,
      },
      {
        id: "b.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        edit: false,
        version: 0,
      },
    ];
    const editable = new Set(["a.ts", "b.ts"]);
    const enabled = new Set(["a.ts"]);

    const result = applyEditSession(items, editable, enabled);
    expect(result[0]?.edit).toBe(true);
    expect(result[0]?.version).toBe(3); // collapse 1 * 2 + 1
    expect(result[1]?.edit).toBe(false);
    expect(result[1]?.version).toBe(0);
    // Non-editing + collapse 0: folded version stays 0 → same reference.
    expect(result[1]).toBe(items[1]);

    // Same collapse-versioned inputs → same outputs (incl. identity).
    const again = applyEditSession(items, editable, enabled);
    expect(again[0]?.version).toBe(3);
    expect(again[1]).toBe(items[1]);
  });
});

describe("applyCommentAnnotations", () => {
  test("folds commentsRev into version and overlays annotations", () => {
    const items = [
      {
        id: "a.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        edit: true,
        version: 3,
      },
      {
        id: "b.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        edit: false,
        version: 0,
      },
    ];
    const annotation = {
      side: "additions" as const,
      lineNumber: 4,
      metadata: {
        kind: "saved" as const,
        key: "c1",
        message: "note",
        range: { start: 4, end: 4, side: "additions" as const },
        snippet: "x",
        language: "ts",
      },
    };
    const withComments = applyCommentAnnotations(
      items,
      { "a.ts": [annotation] },
      2,
    );
    expect(withComments[0]?.version).toBe(3 + 16);
    expect(withComments[0]?.annotations).toEqual([annotation]);
    expect(withComments[1]?.version).toBe(16);
    expect(withComments[1]?.annotations).toBeUndefined();
  });

  test("keeps identity when commentsRev is 0 and there are no comments", () => {
    const items = [
      {
        id: "a.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        version: 2,
      },
    ];
    const result = applyCommentAnnotations(items, {}, 0);
    expect(result[0]).toBe(items[0]);
  });

  test("bumps version when the last comment is removed", () => {
    const items = [
      {
        id: "a.ts",
        type: "diff" as const,
        fileDiff: {} as never,
        version: 1,
      },
    ];
    const annotation = {
      side: "additions" as const,
      lineNumber: 1,
      metadata: {
        kind: "saved" as const,
        key: "c1",
        message: "note",
        range: { start: 1, end: 1, side: "additions" as const },
        snippet: "x",
        language: "ts",
      },
    };
    const withComment = applyCommentAnnotations(
      items,
      { "a.ts": [annotation] },
      1,
    );
    expect(withComment[0]?.annotations?.length).toBe(1);
    const cleared = applyCommentAnnotations(items, {}, 2);
    expect(cleared[0]?.version).toBe(1 + 16);
    expect(cleared[0]?.annotations).toBeUndefined();
  });
});
