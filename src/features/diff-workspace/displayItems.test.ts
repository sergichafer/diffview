import { describe, expect, test } from "bun:test";
import {
  applyDisplayItems,
  attributeCollapsedIds,
  collapseItemVersion,
  itemViewVersion,
  type DisplayItemView,
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

function view(extra: Partial<DisplayItemView> = {}): DisplayItemView {
  return {
    viewedPaths: new Set(),
    expandedWhileViewed: new Set(),
    attributeCollapsedPaths: new Set(),
    editablePaths: new Set(),
    editEnabledPaths: new Set(),
    annotationsById: {},
    annotationsRev: 0,
    ...extra,
  };
}

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

const none = new Set<string>();

describe("collapseItemVersion", () => {
  test("collapses viewed paths unless expanded", () => {
    const viewed = new Set(["a.ts"]);
    const expanded = new Set<string>();
    expect(collapseItemVersion("a.ts", viewed, expanded, none)).toBe(1);
    expect(collapseItemVersion("b.ts", viewed, expanded, none)).toBe(0);
    expect(collapseItemVersion("a.ts", viewed, new Set(["a.ts"]), none)).toBe(2);
  });

  test("collapses unviewed paths that were manually collapsed", () => {
    const viewed = new Set<string>();
    const flipped = new Set(["a.ts"]);
    expect(collapseItemVersion("a.ts", viewed, flipped, none)).toBe(1);
    expect(collapseItemVersion("b.ts", viewed, flipped, none)).toBe(0);
  });

  test("collapses attribute-folded paths until expanded", () => {
    const folded = new Set(["gen/api.ts"]);
    expect(collapseItemVersion("gen/api.ts", none, none, folded)).toBe(1);
    expect(collapseItemVersion("gen/api.ts", none, new Set(["gen/api.ts"]), folded)).toBe(2);
    expect(collapseItemVersion("gen/api.ts", new Set(["gen/api.ts"]), none, folded)).toBe(1);
    expect(collapseItemVersion("src/a.ts", none, none, folded)).toBe(0);
  });
});

describe("attributeCollapsedIds", () => {
  test("keeps collapsed files under their item id", () => {
    const ids = attributeCollapsedIds([
      { path: "./Cargo.lock", collapsed: true },
      { path: "src/main.rs", collapsed: false },
    ]);
    expect([...ids]).toEqual(["Cargo.lock"]);
  });
});

describe("applyDisplayItems", () => {
  test("collapses viewed paths and folds edit into version", () => {
    const items = [diffItem("a.ts"), diffItem("b.ts")];
    const result = applyDisplayItems(
      items,
      view({
        viewedPaths: new Set(["a.ts"]),
        editablePaths: new Set(["a.ts", "b.ts"]),
        editEnabledPaths: new Set(["a.ts"]),
      }),
    );
    expect(result[0]?.collapsed).toBe(true);
    expect(result[0]?.edit).toBe(true);
    expect(result[0]?.version).toBe(itemViewVersion(1, true));
    expect(result[1]?.collapsed).toBe(false);
    expect(result[1]?.edit).toBe(false);
    expect(result[1]?.version).toBe(itemViewVersion(0, false));
  });

  test("collapses unviewed paths that were manually collapsed", () => {
    const result = applyDisplayItems(
      [diffItem("a.ts"), diffItem("b.ts")],
      view({ expandedWhileViewed: new Set(["a.ts"]) }),
    );
    expect(result[0]?.collapsed).toBe(true);
    expect(result[0]?.version).toBe(itemViewVersion(1, false));
    expect(result[1]?.collapsed).toBe(false);
    expect(result[1]?.version).toBe(itemViewVersion(0, false));
  });

  test("collapses attribute-folded paths and unfolds them on expand", () => {
    const folded = new Set(["Cargo.lock"]);
    const items = [diffItem("Cargo.lock"), diffItem("src/main.rs")];
    const initial = applyDisplayItems(
      items,
      view({ attributeCollapsedPaths: folded }),
    );
    expect(initial[0]?.collapsed).toBe(true);
    expect(initial[0]?.version).toBe(itemViewVersion(1, false));
    expect(initial[1]?.collapsed).toBe(false);

    const expanded = applyDisplayItems(
      initial,
      view({
        attributeCollapsedPaths: folded,
        expandedWhileViewed: new Set(["Cargo.lock"]),
      }),
    );
    expect(expanded[0]?.collapsed).toBe(false);
    expect(expanded[0]?.version).toBe(itemViewVersion(2, false));
    expect(expanded[1]).toBe(initial[1]);
  });

  test("preserves identity when presentation already matches", () => {
    const items = [
      diffItem("a.ts", { collapsed: false, edit: false, version: 0 }),
    ];
    const result = applyDisplayItems(items, view());
    expect(result[0]).toBe(items[0]);
  });

  test("overlays annotations and stamps only rows that have them", () => {
    const items = [
      diffItem("a.ts", { edit: true, version: 1 }),
      diffItem("b.ts", { edit: false, version: 0 }),
    ];
    const result = applyDisplayItems(
      items,
      view({
        editablePaths: new Set(["a.ts"]),
        editEnabledPaths: new Set(["a.ts"]),
        annotationsById: { "a.ts": [annotation] },
        annotationsRev: 2,
      }),
    );
    expect(result[0]?.version).toBe(itemViewVersion(0, true, 2));
    expect(result[0]?.annotations).toEqual([annotation]);
    expect(result[1]?.version).toBe(itemViewVersion(0, false, 0));
    expect(result[1]?.annotations).toBeUndefined();
  });

  test("does not rewrite uncommented rows when annotationsRev bumps", () => {
    const items = [
      diffItem("b.ts", { collapsed: false, edit: false, version: 0 }),
    ];
    const result = applyDisplayItems(
      items,
      view({ annotationsRev: 4 }),
    );
    expect(result[0]).toBe(items[0]);
    expect(result[0]?.version).toBe(0);
  });

  test("bumps version when the last comment is removed", () => {
    const items = [diffItem("a.ts")];
    const withComment = applyDisplayItems(
      items,
      view({
        annotationsById: { "a.ts": [annotation] },
        annotationsRev: 1,
      }),
    );
    expect(withComment[0]?.annotations?.length).toBe(1);
    expect(withComment[0]?.version).toBe(itemViewVersion(0, false, 1));
    const cleared = applyDisplayItems(
      items,
      view({ annotationsRev: 2 }),
    );
    expect(cleared[0]?.version).toBe(itemViewVersion(0, false, 0));
    expect(cleared[0]?.annotations).toBeUndefined();
    expect(cleared[0]?.version).not.toBe(withComment[0]?.version);
  });
});
