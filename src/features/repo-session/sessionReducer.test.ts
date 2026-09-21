import { describe, expect, test } from "bun:test";
import type { BranchOverview, FileDiffResult, RepoInfo } from "@/shared/types/app";
import { applyBranchPick } from "@/features/branch-compare/branchCompare";
import { DEFAULT_SETTINGS } from "@/shared/types/app";
import {
  makeComparisonKey,
  sliceComparisonKey,
} from "@/features/branch-compare/comparisonKey";
import type { HistorySlice } from "@/features/history/historyModel";
import { mergeFileDiffs } from "./mergeFileDiffs";
import { buildInitialState } from "./workspaceTreeCodec";
import {
  activeRowFromState,
  sessionReducer,
} from "./sessionReducer";
import {
  emptyComparisonRow,
  emptyMultiSessionState,
  specOf,
  type MultiSessionState,
} from "./types";

const repo: RepoInfo = {
  path: "/repos/demo",
  name: "demo",
  headBranch: "feature",
  defaultBase: "main",
};

const key = makeComparisonKey(repo.path, "main", "feature");

function overview(mergeBase = "abc"): BranchOverview {
  return {
    repoPath: repo.path,
    currentBranch: "feature",
    baseBranch: "main",
    mergeBase,
    headOid: "head1",
    isLive: false,
    files: [
      { path: "a.ts", badges: ["committed"], isBinary: false },
      { path: "b.bin", badges: ["committed"], isBinary: false },
    ],
  };
}

function diff(path: string, isBinary = false): FileDiffResult {
  return { path, patch: "", isBinary, oldPath: null };
}

function openedState(): MultiSessionState {
  const opened = { repo, branches: ["main", "feature"] };
  return buildInitialState(opened, [opened], DEFAULT_SETTINGS);
}

describe("sessionReducer", () => {
  test("patch-overview updates badges without clearing fileDiffs", () => {
    let state = openedState();
    state = sessionReducer(state, {
      type: "comparison-overview",
      key,
      overview: overview(),
    });
    state = sessionReducer(state, {
      type: "append-file-diffs",
      key,
      fileDiffs: [diff("a.ts")],
    });
    const patched = {
      ...overview(),
      isLive: true,
      files: [{ path: "a.ts", badges: ["unstaged" as const], isBinary: false }],
    };
    const next = sessionReducer(state, {
      type: "patch-overview",
      key,
      overview: patched,
    });
    expect(next.comparisons[key]?.fileDiffs).toEqual([diff("a.ts")]);
    expect(next.comparisons[key]?.overview?.files[0]?.badges).toEqual([
      "unstaged",
    ]);
  });

  test("patch-overview preserves row.outdated", () => {
    let state = openedState();
    state = sessionReducer(state, {
      type: "comparison-overview",
      key,
      overview: overview(),
    });
    state = sessionReducer(state, {
      type: "mark-outdated",
      key,
      outdated: true,
    });
    expect(state.comparisons[key]?.outdated).toBe(true);
    const next = sessionReducer(state, {
      type: "patch-overview",
      key,
      overview: {
        ...overview(),
        files: [{ path: "a.ts", badges: ["unstaged" as const], isBinary: false }],
      },
    });
    expect(next.comparisons[key]?.outdated).toBe(true);
  });

  test("comparison-overview clears fileDiffs and sets stamps", () => {
    const withDiffs = sessionReducer(openedState(), {
      type: "append-file-diffs",
      key,
      fileDiffs: [diff("a.ts")],
    });
    const next = sessionReducer(withDiffs, {
      type: "comparison-overview",
      key,
      overview: overview("new"),
    });
    expect(next.comparisons[key]?.fileDiffs).toEqual([]);
    expect(next.comparisons[key]?.mergeBaseOid).toBe("new");
    expect(next.comparisons[key]?.residency).toBe("hot");
  });

  test("append-file-diffs merges by path and enriches binary flags", () => {
    const withOverview = sessionReducer(openedState(), {
      type: "comparison-overview",
      key,
      overview: overview(),
    });
    const next = sessionReducer(withOverview, {
      type: "append-file-diffs",
      key,
      fileDiffs: [diff("b.bin", true)],
    });
    expect(next.comparisons[key]?.fileDiffs).toEqual([diff("b.bin", true)]);
    expect(
      next.comparisons[key]?.overview?.files.find((f) => f.path === "b.bin")
        ?.isBinary,
    ).toBe(true);
    expect(next.comparisons[key]?.residency).toBe("hot");
  });

  test("spawn-comparison adds row under workspace", () => {
    const base = openedState();
    const newKey = makeComparisonKey(repo.path, "develop", "feature");
    const next = sessionReducer(base, {
      type: "spawn-comparison",
      workspaceId: repo.path,
      key: newKey,
      row: emptyComparisonRow(newKey, repo.path, "develop", "feature"),
    });
    expect(next.comparisons[newKey]).toBeDefined();
    expect(next.groups[repo.path]?.comparisonKeys).toContain(newKey);
  });

  test("spawn-comparison never lists a key twice in its group", () => {
    // openRepo seeds a new group with comparisonKeys: [] and then spawns;
    // a group that already lists the key must not append it again.
    const base = openedState();
    const newKey = makeComparisonKey(repo.path, "develop", "feature");
    const withListedKey: MultiSessionState = {
      ...base,
      groups: {
        ...base.groups,
        [repo.path]: {
          ...base.groups[repo.path]!,
          comparisonKeys: [
            ...base.groups[repo.path]!.comparisonKeys,
            newKey,
          ],
        },
      },
    };
    const next = sessionReducer(withListedKey, {
      type: "spawn-comparison",
      workspaceId: repo.path,
      key: newKey,
      row: emptyComparisonRow(newKey, repo.path, "develop", "feature"),
    });
    expect(next.comparisons[newKey]).toBeDefined();
    expect(
      next.groups[repo.path]?.comparisonKeys.filter((k) => k === newKey),
    ).toHaveLength(1);
  });

  test("activate updates activeKey and MRU", () => {
    const newKey = makeComparisonKey(repo.path, "develop", "feature");
    let state = sessionReducer(openedState(), {
      type: "spawn-comparison",
      workspaceId: repo.path,
      key: newKey,
      row: emptyComparisonRow(newKey, repo.path, "develop", "feature"),
    });
    state = sessionReducer(state, { type: "activate", key: newKey });
    expect(state.activeKey).toBe(newKey);
    expect(state.mruKeys[0]).toBe(newKey);
    expect(activeRowFromState(state)?.baseBranch).toBe("develop");
  });

  test("close-comparison removes row and reassigns active", () => {
    const newKey = makeComparisonKey(repo.path, "develop", "feature");
    let state = sessionReducer(openedState(), {
      type: "spawn-comparison",
      workspaceId: repo.path,
      key: newKey,
      row: emptyComparisonRow(newKey, repo.path, "develop", "feature"),
    });
    state = sessionReducer(state, { type: "activate", key: newKey });
    state = sessionReducer(state, { type: "close-comparison", key: newKey });
    expect(state.comparisons[newKey]).toBeUndefined();
    expect(state.activeKey).toBe(key);
  });

  test("demote-hot-to-warm keeps overview and drops diffs", () => {
    let state = sessionReducer(openedState(), {
      type: "comparison-overview",
      key,
      overview: overview(),
    });
    state = sessionReducer(state, {
      type: "append-file-diffs",
      key,
      fileDiffs: [diff("a.ts")],
    });
    state = sessionReducer(state, { type: "demote-hot-to-warm", key });
    expect(state.comparisons[key]?.residency).toBe("warm");
    expect(state.comparisons[key]?.overview).not.toBeNull();
    expect(state.comparisons[key]?.fileDiffs).toEqual([]);
  });

  test("branches refreshes the option list without touching comparison", () => {
    const next = sessionReducer(openedState(), {
      type: "branches",
      workspaceId: repo.path,
      branches: ["main", "feature", "develop"],
      settings: DEFAULT_SETTINGS,
    });
    expect(next.groups[repo.path]?.branches).toEqual([
      "main",
      "feature",
      "develop",
    ]);
    expect(next.comparisons[key]?.baseBranch).toBe("main");
    expect(next.comparisons[key]?.headBranch).toBe("feature");
  });

  test("empty→non-empty branches reseeds unborn labels so a pick can stick", () => {
    const unbornRepo: RepoInfo = {
      ...repo,
      headBranch: "HEAD",
      defaultBase: "main",
    };
    const unbornKey = makeComparisonKey(unbornRepo.path, "main", "HEAD");
    const opened = { repo: unbornRepo, branches: [] as string[] };
    const empty = buildInitialState(opened, [opened], DEFAULT_SETTINGS);
    expect(empty.groups[unbornRepo.path]?.branches).toEqual([]);

    const recovered = sessionReducer(empty, {
      type: "branches",
      workspaceId: unbornRepo.path,
      branches: ["main", "feature"],
      settings: DEFAULT_SETTINGS,
    });
    expect(recovered.groups[unbornRepo.path]?.branches).toEqual([
      "main",
      "feature",
    ]);
    const active = activeRowFromState(recovered);
    expect(active?.baseBranch).toBe("main");
    expect(active?.headBranch).toBe("feature");

    const nextPick = applyBranchPick("head", "develop", {
      head: active!.headBranch,
      base: active!.baseBranch,
    });
    expect(nextPick).toEqual({ head: "develop", base: "main" });
  });

  test("set-history-slice retargets one slot and keeps the branch row", () => {
    const sliceKey = sliceComparisonKey(key);
    const through: HistorySlice = {
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "main",
      specHead: "abc",
      kind: "range",
      label: "First",
      short: "abcdef0",
      detail: "Through abcdef0. 1 later commit hidden.",
      baseLabel: "main",
    };
    const opened = sessionReducer(openedState(), {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice: through,
    });
    expect(opened.activeKey).toBe(sliceKey);
    expect(opened.groups[repo.path]?.comparisonKeys).toEqual([key, sliceKey]);
    expect(opened.comparisons[key]?.headBranch).toBe("feature");
    expect(opened.comparisons[key]?.history).toBeUndefined();
    expect(opened.comparisons[sliceKey]?.baseBranch).toBe("main");
    expect(opened.comparisons[sliceKey]?.headBranch).toBe("feature");
    expect(specOf(opened.comparisons[sliceKey]!).head).toBe("abc");

    const warm = {
      ...opened,
      comparisons: {
        ...opened.comparisons,
        [sliceKey]: {
          ...opened.comparisons[sliceKey]!,
          residency: "hot" as const,
          overview: overview(),
          fileDiffs: [diff("a.ts")],
          error: "stale",
        },
      },
    };
    const commitSlice: HistorySlice = {
      ...through,
      specBase: "parent",
      specHead: "def",
      kind: "commit",
      short: "defdef0",
      detail: "Only defdef0.",
    };
    const next = sessionReducer(warm, {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice: commitSlice,
    });
    expect(next.activeKey).toBe(sliceKey);
    expect(next.comparisons[sliceKey]?.history?.kind).toBe("commit");
    expect(next.comparisons[sliceKey]?.residency).toBe("cold");
    expect(next.comparisons[sliceKey]?.overview).toBeNull();
    expect(next.comparisons[sliceKey]?.fileDiffs).toEqual([]);
    expect(next.comparisons[sliceKey]?.error).toBeNull();
    expect(next.comparisons[sliceKey]?.baseBranch).toBe("main");
    expect(specOf(next.comparisons[sliceKey]!)).toEqual({
      base: "parent",
      head: "def",
    });
    expect(next.groups[repo.path]?.comparisonKeys).toEqual([key, sliceKey]);
    expect(next.comparisons[key]?.headBranch).toBe("feature");

    const kept = sessionReducer(next, {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice: null,
    });
    expect(kept.activeKey).toBe(key);
    expect(kept.comparisons[sliceKey]?.history?.specHead).toBe("def");
  });

  test("an unchanged slice spec does not drop a loaded diff", () => {
    const sliceKey = sliceComparisonKey(key);
    const slice: HistorySlice = {
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "main",
      specHead: "abc",
      kind: "range",
      label: "First",
      short: "abcdef0",
      detail: "Through abcdef0. 1 later commit hidden.",
      baseLabel: "main",
    };
    const opened = sessionReducer(openedState(), {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice,
    });
    const hot = {
      ...opened,
      comparisons: {
        ...opened.comparisons,
        [sliceKey]: {
          ...opened.comparisons[sliceKey]!,
          residency: "hot" as const,
          overview: overview(),
          fileDiffs: [diff("a.ts")],
        },
      },
    };
    const again = sessionReducer(hot, {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice,
    });
    expect(again.comparisons[sliceKey]?.residency).toBe("hot");
    expect(again.comparisons[sliceKey]?.fileDiffs).toHaveLength(1);
  });

  test("branches recovery keeps a slice whose source names are real branches", () => {
    const sliceKey = sliceComparisonKey(key);
    const opened = sessionReducer(openedState(), {
      type: "set-history-slice",
      workspaceId: repo.path,
      sourceKey: key,
      slice: {
        sourceBase: "main",
        sourceHead: "feature",
        specBase: "main",
        specHead: "abcabcabcabc",
        kind: "range",
        label: "First",
        short: "abcabc1",
        detail: "Through abcabc1. 1 later commit hidden.",
        baseLabel: "main",
      },
    });
    const emptied: MultiSessionState = {
      ...opened,
      groups: {
        ...opened.groups,
        [repo.path]: { ...opened.groups[repo.path]!, branches: [] },
      },
    };
    const recovered = sessionReducer(emptied, {
      type: "branches",
      workspaceId: repo.path,
      branches: ["main", "feature"],
      settings: DEFAULT_SETTINGS,
    });
    expect(recovered.activeKey).toBe(sliceKey);
    expect(recovered.comparisons[sliceKey]?.headBranch).toBe("feature");
    expect(recovered.comparisons[key]?.headBranch).toBe("feature");
  });

  test("reset clears to empty session", () => {
    const next = sessionReducer(
      {
        ...openedState(),
        comparisons: {
          [key]: {
            ...emptyComparisonRow(key, repo.path, "main", "feature"),
            overview: overview(),
            fileDiffs: [diff("a.ts")],
          },
        },
      },
      { type: "reset" },
    );
    expect(next).toEqual(emptyMultiSessionState);
  });
});

describe("mergeFileDiffs", () => {
  test("returns a copy when batch is empty", () => {
    const existing = [diff("a.ts")];
    const merged = mergeFileDiffs(existing, []);
    expect(merged).toEqual(existing);
    expect(merged).not.toBe(existing);
  });
});
