import { describe, expect, test } from "bun:test";
import type { HistoryLane } from "@/shared/types/app";
import {
  buildHistoryNodes,
  historyCaption,
  historyNodeDimmed,
  historySliceTarget,
  indexForSelection,
  indexToY,
  relativeCommitTime,
  yToIndex,
  type HistoryMode,
} from "./historyModel";

const lane: HistoryLane = {
  mergeBase: "base-oid",
  headOid: "tip-oid",
  truncated: false,
  commits: [
    {
      oid: "tip-oid",
      short: "tipoid1",
      subject: "Keep the lane schematic",
      parent: "mid-oid",
      time: 1_700_000_300,
    },
    {
      oid: "mid-oid",
      short: "midoid1",
      subject: "Anchor the popover",
      parent: "base-oid",
      time: 1_700_000_200,
    },
  ],
};

const live = buildHistoryNodes(lane, true, "main");
const frozen = buildHistoryNodes(lane, false, "main");

describe("buildHistoryNodes", () => {
  test("live lane starts at the working tree and ends at the merge-base", () => {
    expect(live.map((node) => node.kind)).toEqual(["wip", "commit", "commit", "base"]);
    expect(live[1]).toMatchObject({ tip: true, short: "tipoid1" });
    expect(live[2]).toMatchObject({ tip: false });
  });

  test("a committed comparison has no working-tree row", () => {
    expect(frozen.map((node) => node.kind)).toEqual(["commit", "commit", "base"]);
  });
});

function target(args: {
  nodes?: typeof live;
  index: number;
  mode: HistoryMode;
  headOid?: string;
  mergeBase?: string;
}) {
  return historySliceTarget({
    nodes: args.nodes ?? live,
    index: args.index,
    mode: args.mode,
    sourceBase: "main",
    sourceHead: "feature",
    headOid: args.headOid ?? lane.headOid,
    mergeBase: args.mergeBase ?? lane.mergeBase,
  });
}

describe("historySliceTarget", () => {
  test("working tree stays on the branch comparison", () => {
    expect(target({ index: 0, mode: "range" })).toBeNull();
  });

  test("through the tip hides uncommitted changes", () => {
    expect(target({ index: 1, mode: "range" })).toMatchObject({
      kind: "range",
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "main",
      specHead: "tip-oid",
      short: "tipoid1",
      detail: "Through tipoid1. Uncommitted changes hidden.",
    });
  });

  test("through an earlier commit counts later commits", () => {
    const slice = target({ index: 2, mode: "range" });
    expect(slice?.detail).toBe(
      "Through midoid1. 1 later commit and uncommitted changes hidden.",
    );
    expect(slice?.specHead).toBe("mid-oid");
    expect(slice?.specBase).toBe("main");
  });

  test("this commit compares the commit with its parent", () => {
    expect(target({ index: 2, mode: "commit" })).toMatchObject({
      kind: "commit",
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "base-oid",
      specHead: "mid-oid",
      baseLabel: "main",
      detail: "Only midoid1.",
    });
  });

  test("a commit with no parent does not fall through to a range slice", () => {
    const nodes = buildHistoryNodes(
      {
        ...lane,
        commits: [
          lane.commits[0]!,
          { ...lane.commits[1]!, parent: "" },
        ],
      },
      true,
      "main",
    );
    expect(target({ nodes, index: 2, mode: "commit" })).toBeNull();
    expect(
      historyCaption({
        nodes,
        index: 2,
        mode: "commit",
        sourceBase: "main",
        sourceHead: "feature",
        headOid: lane.headOid,
        mergeBase: lane.mergeBase,
        truncated: false,
      }),
    ).toBe("This commit. Anchor the popover.");
  });

  test("the tip of a committed comparison stays on the branch", () => {
    expect(target({ nodes: frozen, index: 0, mode: "range" })).toBeNull();
  });

  test("merge-base of an ahead branch is its own slice", () => {
    expect(target({ index: 3, mode: "range" })).toMatchObject({
      kind: "base",
      specBase: "main",
      specHead: "base-oid",
      label: "main",
      detail: "Merge-base. Nothing ahead of this point.",
    });
  });

  test("in-sync base returns null", () => {
    const synced = buildHistoryNodes(
      { ...lane, headOid: lane.mergeBase, commits: [] },
      true,
      "main",
    );
    expect(
      target({
        nodes: synced,
        index: 1,
        mode: "range",
        headOid: lane.mergeBase,
        mergeBase: lane.mergeBase,
      }),
    ).toBeNull();
  });
});

describe("history captions and dimming", () => {
  test("range mode dims only newer rows", () => {
    expect(historyNodeDimmed(live, 0, 2, "range")).toBe(true);
    expect(historyNodeDimmed(live, 2, 2, "range")).toBe(false);
    expect(historyNodeDimmed(live, 3, 2, "range")).toBe(false);
  });

  test("commit mode dims every other row", () => {
    expect(historyNodeDimmed(live, 2, 2, "commit")).toBe(false);
    expect(historyNodeDimmed(live, 1, 2, "commit")).toBe(true);
    expect(historyNodeDimmed(live, 3, 2, "commit")).toBe(true);
  });

  test("caption names the selected commit", () => {
    expect(
      historyCaption({
        nodes: live,
        index: 2,
        mode: "commit",
        sourceBase: "main",
        sourceHead: "feature",
        headOid: lane.headOid,
        mergeBase: lane.mergeBase,
        truncated: false,
      }),
    ).toBe("This commit. Anchor the popover.");
  });
});

describe("indexForSelection", () => {
  test("no head selects the working tree when the comparison is live", () => {
    expect(indexForSelection(live, null)).toBe(0);
  });

  test("a commit oid selects that row", () => {
    expect(indexForSelection(live, "mid-oid")).toBe(2);
  });

  test("the merge-base oid selects the base row", () => {
    expect(indexForSelection(frozen, "base-oid")).toBe(2);
  });
});

describe("indexToY", () => {
  test("row centers round back to their index", () => {
    expect(Math.round(yToIndex(indexToY(3, 52), 52))).toBe(3);
  });
});

describe("relativeCommitTime", () => {
  const now = 1_700_000_000;

  test("buckets grow with age", () => {
    expect(relativeCommitTime(now - 10, now)).toBe("now");
    expect(relativeCommitTime(now - 120, now)).toBe("2m");
    expect(relativeCommitTime(now - 7200, now)).toBe("2h");
    expect(relativeCommitTime(now - 172800, now)).toBe("2d");
    expect(relativeCommitTime(now - 1_209_600, now)).toBe("2w");
  });
});
