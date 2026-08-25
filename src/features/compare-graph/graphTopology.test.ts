import { describe, expect, test } from "bun:test";
import {
  graphTopology,
  comparisonHasWip,
  comparisonIsLive,
  graphDetail,
  graphTitle,
  type GraphOverviewSlice,
} from "./graphTopology";

const overview = (
  overrides: Partial<GraphOverviewSlice> = {},
): GraphOverviewSlice => ({
  mergeBase: "mb",
  headOid: "hd",
  currentBranch: "feature",
  baseBranch: "origin/main",
  ...overrides,
});

describe("comparisonIsLive", () => {
  test("empty head is working-tree live even when overview still says committed", () => {
    expect(
      comparisonIsLive({ isLive: false, currentBranch: "feature" }, ""),
    ).toBe(true);
  });

  test("head matching the checked-out branch is live", () => {
    expect(
      comparisonIsLive({ isLive: false, currentBranch: "feature" }, "feature"),
    ).toBe(true);
  });

  test("a named head other than the checked-out branch is committed", () => {
    expect(
      comparisonIsLive({ isLive: true, currentBranch: "feature" }, "release/1.4"),
    ).toBe(false);
  });

  test("null overview treats empty head as live and a named head as committed", () => {
    expect(comparisonIsLive(null, "")).toBe(true);
    expect(comparisonIsLive(null, "feature")).toBe(false);
  });
});

describe("comparisonHasWip", () => {
  test("live comparison with unstaged files is WIP", () => {
    expect(
      comparisonHasWip(
        {
          isLive: true,
          currentBranch: "feature",
          files: [{ path: "a.ts", badges: ["unstaged"], isBinary: false }],
        },
        "feature",
      ),
    ).toBe(true);
  });

  test("live comparison with only committed files is not WIP", () => {
    expect(
      comparisonHasWip(
        {
          isLive: true,
          currentBranch: "feature",
          files: [{ path: "a.ts", badges: ["committed"], isBinary: false }],
        },
        "feature",
      ),
    ).toBe(false);
  });

  test("committed comparison with dirty badges is not WIP", () => {
    expect(
      comparisonHasWip(
        {
          isLive: true,
          currentBranch: "feature",
          files: [{ path: "a.ts", badges: ["unstaged"], isBinary: false }],
        },
        "release/1.4",
      ),
    ).toBe(false);
  });
});

describe("graphTopology", () => {
  test("diverged uses head metadata versus the comparison base", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview(),
      metadata: [{ name: "feature", ahead: 4, behind: 2 }],
    });
    expect(graph).toEqual({
      kind: "diverged",
      ahead: 4,
      behind: 2,
      baseLabel: "origin/main",
    });
    expect(graphTitle(graph)).toBe("Diverged");
    expect(graphDetail(graph)).toBe("4 ahead of origin/main, 2 behind.");
  });

  test("linear is ahead with an empty behind lane", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview(),
      metadata: [{ name: "feature", ahead: 6, behind: 0 }],
    });
    expect(graph).toEqual({
      kind: "linear",
      ahead: 6,
      baseLabel: "origin/main",
    });
    expect(graphTitle(graph)).toBe("Linear");
    expect(graphDetail(graph)).toBe("6 ahead, 0 behind.");
  });

  test("behind is an empty ahead lane", () => {
    const graph = graphTopology({
      head: "release/1.4",
      base: "origin/main",
      overview: overview({
        currentBranch: "release/1.4",
      }),
      metadata: [{ name: "release/1.4", ahead: 0, behind: 3 }],
    });
    expect(graph).toEqual({
      kind: "behind",
      behind: 3,
      baseLabel: "origin/main",
    });
    expect(graphTitle(graph)).toBe("Behind");
    expect(graphDetail(graph)).toBe("0 ahead, 3 behind.");
  });

  test("in sync is empty on both lanes", () => {
    const graph = graphTopology({
      head: "main",
      base: "main",
      overview: overview({
        currentBranch: "main",
        baseBranch: "main",
      }),
      metadata: [{ name: "main", ahead: 0, behind: 0 }],
    });
    expect(graph).toEqual({ kind: "sync", baseLabel: "main" });
    expect(graphTitle(graph)).toBe("In sync");
    expect(graphDetail(graph)).toBe("0 ahead, 0 behind.");
  });

  test("empty head looks up overview.currentBranch in metadata", () => {
    const graph = graphTopology({
      head: "",
      base: "origin/main",
      overview: overview({ currentBranch: "feature" }),
      metadata: [
        { name: "main", ahead: 0, behind: 0 },
        { name: "feature", ahead: 3, behind: 1 },
      ],
    });
    expect(graph).toEqual({
      kind: "diverged",
      ahead: 3,
      behind: 1,
      baseLabel: "origin/main",
    });
    expect(graphTitle(graph)).toBe("Diverged");
    expect(graphDetail(graph)).toBe("3 ahead of origin/main, 1 behind.");
  });

  test("missing metadata is unknown until counts load", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview(),
      metadata: [],
    });
    expect(graph).toEqual({ kind: "unknown", baseLabel: "origin/main" });
    expect(graphTitle(graph)).toBe("Graph");
    expect(graphDetail(graph)).toBe("Waiting for branch counts.");
  });

  test("metadata for other branches does not count as this head", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview(),
      metadata: [{ name: "main", ahead: 9, behind: 4 }],
    });
    expect(graph).toEqual({ kind: "unknown", baseLabel: "origin/main" });
  });

  test("null overview with empty head is unknown until metadata", () => {
    const graph = graphTopology({
      head: "",
      base: "main",
      overview: null,
      metadata: [],
    });
    expect(graph).toEqual({ kind: "unknown", baseLabel: "main" });
  });

  test("null overview with a named head is committed", () => {
    const graph = graphTopology({
      head: "feature",
      base: "main",
      overview: null,
      metadata: [{ name: "feature", ahead: 5, behind: 0 }],
    });
    expect(graph).toEqual({
      kind: "linear",
      ahead: 5,
      baseLabel: "main",
    });
    expect(graphTitle(graph)).toBe("Linear");
    expect(graphDetail(graph)).toBe("5 ahead, 0 behind.");
  });

  test("long lanes keep raw counts on the diverged variant", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview(),
      metadata: [{ name: "feature", ahead: 20, behind: 15 }],
    });
    expect(graph).toEqual({
      kind: "diverged",
      ahead: 20,
      behind: 15,
      baseLabel: "origin/main",
    });
    expect(graphTitle(graph)).toBe("Diverged");
    expect(graphDetail(graph)).toBe("20 ahead of origin/main, 15 behind.");
  });

  test("matching mergeBase and headOid is sync when counts have not loaded", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ mergeBase: "abc", headOid: "abc" }),
      metadata: [],
    });
    expect(graph).toEqual({ kind: "sync", baseLabel: "origin/main" });
    expect(graphTitle(graph)).toBe("In sync");
    expect(graphDetail(graph)).toBe("0 ahead, 0 behind.");
  });

  test("empty mergeBase does not count as sync", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ mergeBase: "", headOid: "" }),
      metadata: [],
    });
    expect(graph).toEqual({ kind: "unknown", baseLabel: "origin/main" });
  });
});
