import { describe, expect, test } from "bun:test";
import type { HistoryLane } from "@/shared/types/app";
import {
  buildHistoryNodes,
  historyCaption,
  historyNodeDimmed,
  historySliceTarget,
  indexForSelection,
  relativeCommitTime,
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

describe("historySliceTarget", () => {
  test("working tree stays on the branch comparison", () => {
    expect(
      historySliceTarget({
        nodes: live,
        index: 0,
        mode: "range",
        baseBranch: "main",
        headOid: lane.headOid,
        mergeBase: lane.mergeBase,
      }),
    ).toBeNull();
  });

  test("through the tip hides uncommitted changes", () => {
    const target = historySliceTarget({
      nodes: live,
      index: 1,
      mode: "range",
      baseBranch: "main",
      headOid: lane.headOid,
      mergeBase: lane.mergeBase,
    });
    expect(target).toMatchObject({
      mode: "range",
      baseBranch: "main",
      headBranch: "tip-oid",
      short: "tipoid1",
      historyMark: "through here",
      detail: "Through tipoid1. Uncommitted changes hidden.",
    });
  });

  test("through an earlier commit counts later commits", () => {
    const target = historySliceTarget({
      nodes: live,
      index: 2,
      mode: "range",
      baseBranch: "main",
      headOid: lane.headOid,
      mergeBase: lane.mergeBase,
    });
    expect(target?.detail).toBe(
      "Through midoid1. 1 later commit and uncommitted changes hidden.",
    );
    expect(target?.headBranch).toBe("mid-oid");
  });

  test("this commit compares the commit with its parent", () => {
    const target = historySliceTarget({
      nodes: live,
      index: 2,
      mode: "commit",
      baseBranch: "main",
      headOid: lane.headOid,
      mergeBase: lane.mergeBase,
    });
    expect(target).toMatchObject({
      mode: "commit",
      baseBranch: "base-oid",
      headBranch: "mid-oid",
      historyBaseLabel: "main",
      historyMark: "this commit",
      detail: "Only midoid1.",
    });
  });

  test("the tip of a committed comparison stays on the branch", () => {
    expect(
      historySliceTarget({
        nodes: frozen,
        index: 0,
        mode: "range",
        baseBranch: "main",
        headOid: lane.headOid,
        mergeBase: lane.mergeBase,
      }),
    ).toBeNull();
  });

  test("merge-base of an ahead branch is its own slice", () => {
    const target = historySliceTarget({
      nodes: live,
      index: 3,
      mode: "range",
      baseBranch: "main",
      headOid: lane.headOid,
      mergeBase: lane.mergeBase,
    });
    expect(target).toMatchObject({
      headBranch: "base-oid",
      historyMark: "merge-base",
      label: "main",
    });
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
        baseBranch: "main",
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
