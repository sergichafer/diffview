import { describe, expect, test } from "bun:test";
import type { OpenRepoResult, RepoInfo } from "@/shared/types/app";
import { DEFAULT_SETTINGS, type AppSettings } from "@/shared/types/app";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import {
  buildInitialState,
  mergeOpenedIntoTree,
} from "./workspaceTreeCodec";

const repoA: RepoInfo = {
  path: "/repos/a/",
  name: "a",
  headBranch: "feature",
  defaultBase: "main",
};
const repoB: RepoInfo = {
  path: "/repos/b/",
  name: "b",
  headBranch: "dev",
  defaultBase: "main",
};
const repoC: RepoInfo = {
  path: "/repos/c/",
  name: "c",
  headBranch: "main",
  defaultBase: "main",
};

function opened(repo: RepoInfo, branches: string[]): OpenRepoResult {
  return { repo, branches };
}

const keyA = makeComparisonKey(repoA.path, "main", "feature");
const keyB = makeComparisonKey(repoB.path, "main", "dev");

function settingsWithTree(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    workspaceTree: {
      workspaces: [
        {
          repoPath: repoA.path,
          collapsed: false,
          comparisons: [{ baseBranch: "main", headBranch: "feature" }],
        },
        {
          repoPath: repoB.path,
          collapsed: true,
          comparisons: [{ baseBranch: "main", headBranch: "dev" }],
        },
      ],
      activeComparisonKey: keyB,
      columnCollapsed: false,
    },
  };
}

describe("buildInitialState", () => {
  test("restores every persisted workspace, not just the bootstrap one", () => {
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"]), opened(repoB, ["main", "dev"])],
      settingsWithTree(),
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(state.comparisons[keyA]).toBeDefined();
    expect(state.comparisons[keyB]).toBeDefined();
    expect(state.groups[repoB.path]?.collapsed).toBe(true);
    // Persisted active comparison wins over the bootstrap repo.
    expect(state.activeKey).toBe(keyB);
    // Restored rows start cold; warming happens on idle.
    expect(state.comparisons[keyA]?.residency).toBe("cold");
    expect(state.comparisons[keyB]?.residency).toBe("cold");
  });

  test("skips workspaces whose repo failed to open", () => {
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"])],
      settingsWithTree(),
    );
    expect(state.workspaceOrder).toEqual([repoA.path]);
    expect(state.comparisons[keyB]).toBeUndefined();
  });

  test("bootstrap repo missing from the tree is appended, tree preserved", () => {
    const state = buildInitialState(
      opened(repoC, ["main"]),
      [
        opened(repoA, ["main", "feature"]),
        opened(repoB, ["main", "dev"]),
        opened(repoC, ["main"]),
      ],
      settingsWithTree(),
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path, repoC.path]);
    expect(state.comparisons[keyA]).toBeDefined();
    expect(state.comparisons[keyB]).toBeDefined();
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    expect(state.comparisons[keyC]).toBeDefined();
    // CLI/bootstrap-opened workspace becomes active.
    expect(state.activeKey).toBe(keyC);
    expect(state.mruKeys[0]).toBe(keyC);
  });

  test("CLI args open every repo as a workspace, first stays active", () => {
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [
        opened(repoA, ["main", "feature"]),
        opened(repoB, ["main", "dev"]),
        opened(repoC, ["main"]),
      ],
      DEFAULT_SETTINGS,
      true,
    );
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path, repoC.path]);
    expect(state.comparisons[keyA]).toBeDefined();
    expect(state.comparisons[keyB]).toBeDefined();
    expect(state.comparisons[keyC]).toBeDefined();
    expect(state.activeKey).toBe(keyA);
    expect(state.mruKeys[0]).toBe(keyA);
  });

  test("CLI repos missing from the tree are appended; first CLI repo is active", () => {
    const state = buildInitialState(
      opened(repoC, ["main"]),
      [
        opened(repoC, ["main"]),
        opened(repoA, ["main", "feature"]),
        opened(repoB, ["main", "dev"]),
      ],
      settingsWithTree(),
      true,
    );
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path, repoC.path]);
    expect(state.activeKey).toBe(keyC);
    expect(state.mruKeys[0]).toBe(keyC);
  });

  test("CLI repo already in the tree becomes active", () => {
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"]), opened(repoB, ["main", "dev"])],
      settingsWithTree(),
      true,
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(state.activeKey).toBe(keyA);
    expect(state.mruKeys[0]).toBe(keyA);
  });
});

describe("mergeOpenedIntoTree", () => {
  test("refreshes repo/branches for a workspace already in the tree", () => {
    const base = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"]), opened(repoB, ["main", "dev"])],
      settingsWithTree(),
    );
    const next = mergeOpenedIntoTree(
      base,
      opened(repoA, ["main", "feature", "new-branch"]),
      DEFAULT_SETTINGS,
    );
    expect(next.groups[repoA.path]?.branches).toContain("new-branch");
    expect(next.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(next.activeKey).toBe(base.activeKey);
  });
});
