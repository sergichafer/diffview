import { describe, expect, test } from "bun:test";
import {
  graphTopology,
  intermediateDotCount,
  MAX_INTERMEDIATE_DOTS,
  type GraphOverviewSlice,
} from "./graphTopology";

const overview = (
  overrides: Partial<GraphOverviewSlice> = {},
): GraphOverviewSlice => ({
  isLive: true,
  mergeBase: "mb",
  headOid: "hd",
  currentBranch: "feature",
  baseBranch: "origin/main",
  ...overrides,
});

describe("intermediateDotCount", () => {
  test("skips the tip so 1 commit draws no intermediates", () => {
    expect(intermediateDotCount(0)).toBe(0);
    expect(intermediateDotCount(1)).toBe(0);
    expect(intermediateDotCount(4)).toBe(3);
  });

  test("caps unlabelled dots", () => {
    expect(intermediateDotCount(MAX_INTERMEDIATE_DOTS + 1)).toBe(
      MAX_INTERMEDIATE_DOTS,
    );
    expect(intermediateDotCount(40)).toBe(MAX_INTERMEDIATE_DOTS);
  });
});

describe("graphTopology", () => {
  test("diverged uses head metadata versus the comparison base", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: false }),
      metadata: [{ name: "feature", ahead: 4, behind: 2 }],
    });
    expect(graph.kind).toBe("diverged");
    expect(graph.title).toBe("Diverged");
    expect(graph.caption).toBe(
      "Diverged. 4 ahead of origin/main, 2 behind.",
    );
    expect(graph.ahead).toBe(4);
    expect(graph.behind).toBe(2);
    expect(graph.drawnAhead).toBe(3);
    expect(graph.drawnBehind).toBe(1);
    expect(graph.isLive).toBe(false);
    expect(graph.hasMetadata).toBe(true);
  });

  test("linear is ahead with an empty behind lane", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: false }),
      metadata: [{ name: "feature", ahead: 6, behind: 0 }],
    });
    expect(graph.kind).toBe("linear");
    expect(graph.caption).toBe("Linear. 6 ahead, 0 behind.");
    expect(graph.drawnAhead).toBe(5);
    expect(graph.drawnBehind).toBe(0);
  });

  test("behind is an empty ahead lane", () => {
    const graph = graphTopology({
      head: "release/1.4",
      base: "origin/main",
      overview: overview({
        isLive: false,
        currentBranch: "release/1.4",
      }),
      metadata: [{ name: "release/1.4", ahead: 0, behind: 3 }],
    });
    expect(graph.kind).toBe("behind");
    expect(graph.caption).toBe("Behind. 0 ahead, 3 behind.");
    expect(graph.drawnAhead).toBe(0);
    expect(graph.drawnBehind).toBe(2);
  });

  test("in sync is empty on both lanes", () => {
    const graph = graphTopology({
      head: "main",
      base: "main",
      overview: overview({
        isLive: false,
        currentBranch: "main",
        baseBranch: "main",
      }),
      metadata: [{ name: "main", ahead: 0, behind: 0 }],
    });
    expect(graph.kind).toBe("sync");
    expect(graph.caption).toBe("In sync. 0 ahead, 0 behind.");
    expect(graph.drawnAhead).toBe(0);
    expect(graph.drawnBehind).toBe(0);
  });

  test("live working tree keeps the hollow node flag", () => {
    const graph = graphTopology({
      head: "",
      base: "origin/main",
      overview: overview({ isLive: true, currentBranch: "feature" }),
      metadata: [{ name: "feature", ahead: 4, behind: 2 }],
    });
    expect(graph.isLive).toBe(true);
    expect(graph.kind).toBe("diverged");
    expect(graph.hasMetadata).toBe(true);
  });

  test("committed comparison is not live", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: false }),
      metadata: [{ name: "feature", ahead: 2, behind: 0 }],
    });
    expect(graph.isLive).toBe(false);
    expect(graph.kind).toBe("linear");
  });

  test("empty head looks up overview.currentBranch in metadata", () => {
    const graph = graphTopology({
      head: "",
      base: "origin/main",
      overview: overview({ isLive: true, currentBranch: "feature" }),
      metadata: [
        { name: "main", ahead: 0, behind: 0 },
        { name: "feature", ahead: 3, behind: 1 },
      ],
    });
    expect(graph.ahead).toBe(3);
    expect(graph.behind).toBe(1);
    expect(graph.kind).toBe("diverged");
    expect(graph.caption).toBe(
      "Diverged. 3 ahead of origin/main, 1 behind.",
    );
  });

  test("missing metadata is unknown until counts load", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: true }),
      metadata: [],
    });
    expect(graph.hasMetadata).toBe(false);
    expect(graph.kind).toBe("unknown");
    expect(graph.ahead).toBe(0);
    expect(graph.behind).toBe(0);
    expect(graph.caption).toBe("Graph. Waiting for branch counts.");
    expect(graph.isLive).toBe(true);
    expect(graph.baseLabel).toBe("origin/main");
    expect(graph.drawnAhead).toBe(0);
    expect(graph.drawnBehind).toBe(0);
  });

  test("metadata for other branches does not count as this head", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: false }),
      metadata: [{ name: "main", ahead: 9, behind: 4 }],
    });
    expect(graph.hasMetadata).toBe(false);
    expect(graph.kind).toBe("unknown");
    expect(graph.ahead).toBe(0);
    expect(graph.behind).toBe(0);
  });

  test("null overview with empty head is live and unknown until metadata", () => {
    const graph = graphTopology({
      head: "",
      base: "main",
      overview: null,
      metadata: [],
    });
    expect(graph.isLive).toBe(true);
    expect(graph.kind).toBe("unknown");
    expect(graph.baseLabel).toBe("main");
    expect(graph.hasMetadata).toBe(false);
  });

  test("null overview with a named head is committed", () => {
    const graph = graphTopology({
      head: "feature",
      base: "main",
      overview: null,
      metadata: [{ name: "feature", ahead: 5, behind: 0 }],
    });
    expect(graph.isLive).toBe(false);
    expect(graph.kind).toBe("linear");
    expect(graph.caption).toBe("Linear. 5 ahead, 0 behind.");
  });

  test("caps drawn intermediates on a long lane", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ isLive: false }),
      metadata: [{ name: "feature", ahead: 20, behind: 15 }],
    });
    expect(graph.kind).toBe("diverged");
    expect(graph.ahead).toBe(20);
    expect(graph.behind).toBe(15);
    expect(graph.drawnAhead).toBe(MAX_INTERMEDIATE_DOTS);
    expect(graph.drawnBehind).toBe(MAX_INTERMEDIATE_DOTS);
    expect(graph.caption).toBe(
      "Diverged. 20 ahead of origin/main, 15 behind.",
    );
  });

  test("matching mergeBase and headOid is sync when counts have not loaded", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ mergeBase: "abc", headOid: "abc", isLive: false }),
      metadata: [],
    });
    expect(graph.hasMetadata).toBe(false);
    expect(graph.kind).toBe("sync");
    expect(graph.caption).toBe("In sync. 0 ahead, 0 behind.");
    expect(graph.drawnAhead).toBe(0);
    expect(graph.drawnBehind).toBe(0);
  });

  test("empty mergeBase does not count as sync", () => {
    const graph = graphTopology({
      head: "feature",
      base: "origin/main",
      overview: overview({ mergeBase: "", headOid: "", isLive: false }),
      metadata: [],
    });
    expect(graph.kind).toBe("unknown");
    expect(graph.hasMetadata).toBe(false);
  });
});
