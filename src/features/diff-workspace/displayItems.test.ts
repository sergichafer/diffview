import { describe, expect, test } from "bun:test";
import {
  ANNOTATION_VERSION_STRIDE,
  applyDisplayItems,
  applyEditSession,
  applyViewedCollapse,
  collapseItemVersion,
  itemViewVersion,
} from "./displayItems";

function diffItem(
  id: string,
  extra: { collapsed?: boolean; edit?: boolean; version?: number } = {},
) {
  return {
    id,
    type: "diff" as const,
    fileDiff: {} as never,
    ...extra,
  };
}

describe("applyViewedCollapse", () => {
  test("collapses viewed paths unless expanded", () => {
    const items = [diffItem("a.ts"), diffItem("b.ts")];
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
    const items = [diffItem("a.ts"), diffItem("b.ts")];
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
    const items = [
      diffItem("a.ts", { edit: false, version: 1 }),
      diffItem("b.ts", { edit: false, version: 0 }),
    ];
    const editable = new Set(["a.ts", "b.ts"]);
    const enabled = new Set(["a.ts"]);

    const result = applyEditSession(items, editable, enabled);
    expect(result[0]?.edit).toBe(true);
    expect(result[0]?.version).toBe(3);
    expect(result[1]?.edit).toBe(false);
    expect(result[1]?.version).toBe(0);
    expect(result[1]).toBe(items[1]);

    const again = applyEditSession(items, editable, enabled);
    expect(again[0]?.version).toBe(3);
    expect(again[1]).toBe(items[1]);
  });
});

describe("applyDisplayItems", () => {
  test("matches collapse then edit when there are no annotations", () => {
    const items = [diffItem("a.ts"), diffItem("b.ts")];
    const viewedPaths = new Set(["a.ts"]);
    const expandedWhileViewed = new Set<string>();
    const editablePaths = new Set(["a.ts", "b.ts"]);
    const editEnabledPaths = new Set(["a.ts"]);

    const staged = applyEditSession(
      applyViewedCollapse(items, viewedPaths, expandedWhileViewed),
      editablePaths,
      editEnabledPaths,
    );
    const unified = applyDisplayItems(items, {
      viewedPaths,
      expandedWhileViewed,
      editablePaths,
      editEnabledPaths,
    });

    expect(
      unified.map((item) => ({
        id: item.id,
        collapsed: item.collapsed,
        edit: item.edit,
        version: item.version,
        annotations: item.annotations,
      })),
    ).toEqual(
      staged.map((item) => ({
        id: item.id,
        collapsed: item.collapsed,
        edit: item.edit,
        version: item.version,
        annotations: item.annotations,
      })),
    );
  });

  test("folds annotationsRev into version and overlays annotations", () => {
    const items = [
      diffItem("a.ts", { edit: true, version: 3 }),
      diffItem("b.ts", { edit: false, version: 0 }),
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
    const withComments = applyDisplayItems(items, {
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      editablePaths: new Set(["a.ts"]),
      editEnabledPaths: new Set(["a.ts"]),
      annotationsById: { "a.ts": [annotation] },
      annotationsRev: 2,
    });
    expect(withComments[0]?.version).toBe(
      itemViewVersion(0, true, 2),
    );
    expect(withComments[0]?.version).toBe(2 * ANNOTATION_VERSION_STRIDE + 1);
    expect(withComments[0]?.annotations).toEqual([annotation]);
    expect(withComments[1]?.version).toBe(2 * ANNOTATION_VERSION_STRIDE);
    expect(withComments[1]?.annotations).toBeUndefined();
  });

  test("keeps identity when annotationsRev is 0 and presentation matches", () => {
    const items = [
      diffItem("a.ts", { collapsed: false, edit: false, version: 0 }),
    ];
    const result = applyDisplayItems(items, {
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      editablePaths: new Set(),
      editEnabledPaths: new Set(),
    });
    expect(result[0]).toBe(items[0]);
  });

  test("bumps version when the last comment is removed", () => {
    const items = [diffItem("a.ts")];
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
    const withComment = applyDisplayItems(items, {
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      editablePaths: new Set(),
      editEnabledPaths: new Set(),
      annotationsById: { "a.ts": [annotation] },
      annotationsRev: 1,
    });
    expect(withComment[0]?.annotations?.length).toBe(1);
    const cleared = applyDisplayItems(items, {
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      editablePaths: new Set(),
      editEnabledPaths: new Set(),
      annotationsRev: 2,
    });
    expect(cleared[0]?.version).toBe(2 * ANNOTATION_VERSION_STRIDE);
    expect(cleared[0]?.annotations).toBeUndefined();
  });

  test("matches staged collapse, edit, then annotation version fold", () => {
    const items = [diffItem("a.ts"), diffItem("b.ts")];
    const viewedPaths = new Set(["a.ts"]);
    const expandedWhileViewed = new Set<string>();
    const editablePaths = new Set(["a.ts"]);
    const editEnabledPaths = new Set(["a.ts"]);
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
    const staged = applyEditSession(
      applyViewedCollapse(items, viewedPaths, expandedWhileViewed),
      editablePaths,
      editEnabledPaths,
    ).map((item) => ({
      id: item.id,
      collapsed: item.collapsed,
      edit: item.edit,
      version: (item.version ?? 0) + 2 * ANNOTATION_VERSION_STRIDE,
      hasAnnotations: item.id === "a.ts",
    }));
    const unified = applyDisplayItems(items, {
      viewedPaths,
      expandedWhileViewed,
      editablePaths,
      editEnabledPaths,
      annotationsById: { "a.ts": [annotation] },
      annotationsRev: 2,
    }).map((item) => ({
      id: item.id,
      collapsed: item.collapsed,
      edit: item.edit,
      version: item.version,
      hasAnnotations: (item.annotations?.length ?? 0) > 0,
    }));
    expect(unified).toEqual(staged);
  });
});
