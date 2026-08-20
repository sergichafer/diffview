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
      [repoA.path, repoB.path, repoC.path],
    );
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path, repoC.path]);
    expect(state.comparisons[keyA]).toBeDefined();
    expect(state.comparisons[keyB]).toBeDefined();
    expect(state.comparisons[keyC]).toBeDefined();
    expect(state.activeKey).toBe(keyA);
    expect(state.mruKeys).toEqual([keyA, keyB, keyC]);
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
      [repoC.path],
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
      [repoA.path],
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(state.activeKey).toBe(keyA);
    expect(state.mruKeys[0]).toBe(keyA);
  });

  test("empty-comparison persisted workspace is restored as a header", () => {
    const settings: AppSettings = {
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
            collapsed: false,
            comparisons: [],
          },
        ],
        activeComparisonKey: keyA,
        columnCollapsed: false,
      },
    };
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"]), opened(repoB, ["main", "dev"])],
      settings,
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(state.groups[repoB.path]?.comparisonKeys).toEqual([]);
    expect(state.activeKey).toBe(keyA);
    expect(state.comparisons[keyB]).toBeUndefined();
  });

  test("CLI can open a repo the persisted tree listed with no comparisons", () => {
    const settings: AppSettings = {
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
            collapsed: false,
            comparisons: [],
          },
        ],
        activeComparisonKey: keyA,
        columnCollapsed: false,
      },
    };
    const state = buildInitialState(
      opened(repoB, ["main", "dev"]),
      [opened(repoB, ["main", "dev"]), opened(repoA, ["main", "feature"])],
      settings,
      [repoB.path],
    );
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path]);
    expect(state.activeKey).toBe(keyB);
    expect(state.mruKeys[0]).toBe(keyB);
  });

  test("reopen restores a header-only workspace without seeding a comparison", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      workspaceTree: {
        workspaces: [
          {
            repoPath: repoA.path,
            collapsed: false,
            comparisons: [],
          },
        ],
        activeComparisonKey: keyA,
        columnCollapsed: false,
      },
    };
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"])],
      settings,
    );
    expect(state.workspaceOrder).toEqual([repoA.path]);
    expect(state.groups[repoA.path]?.comparisonKeys).toEqual([]);
    expect(state.activeKey).toBeNull();
  });

  test("CLI opens every named repo even when the tree listed them empty", () => {
    const settings: AppSettings = {
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
            collapsed: false,
            comparisons: [],
          },
          {
            repoPath: repoC.path,
            collapsed: false,
            comparisons: [],
          },
        ],
        activeComparisonKey: keyA,
        columnCollapsed: false,
      },
    };
    const state = buildInitialState(
      opened(repoB, ["main", "dev"]),
      [
        opened(repoB, ["main", "dev"]),
        opened(repoC, ["main"]),
        opened(repoA, ["main", "feature"]),
      ],
      settings,
      [repoB.path, repoC.path],
    );
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    expect(state.workspaceOrder).toEqual([repoA.path, repoB.path, repoC.path]);
    expect(state.activeKey).toBe(keyB);
    expect(state.comparisons[keyC]).toBeDefined();
  });

  test("later CLI repos already in the tree are hoisted in MRU", () => {
    const settings: AppSettings = {
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
            collapsed: false,
            comparisons: [{ baseBranch: "main", headBranch: "dev" }],
          },
          {
            repoPath: repoC.path,
            collapsed: false,
            comparisons: [{ baseBranch: "main", headBranch: "main" }],
          },
        ],
        activeComparisonKey: keyB,
        columnCollapsed: false,
      },
    };
    const keyC = makeComparisonKey(repoC.path, "main", "main");
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [
        opened(repoA, ["main", "feature"]),
        opened(repoB, ["main", "dev"]),
        opened(repoC, ["main"]),
      ],
      settings,
      [repoA.path, repoC.path],
    );
    expect(state.activeKey).toBe(keyA);
    expect(state.mruKeys).toEqual([keyA, keyC, keyB]);
  });

  test("leading empty persisted workspace does not steal activeKey", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      workspaceTree: {
        workspaces: [
          {
            repoPath: repoB.path,
            collapsed: false,
            comparisons: [],
          },
          {
            repoPath: repoA.path,
            collapsed: false,
            comparisons: [{ baseBranch: "main", headBranch: "feature" }],
          },
        ],
        columnCollapsed: false,
      },
    };
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoB, ["main", "dev"]), opened(repoA, ["main", "feature"])],
      settings,
    );
    expect(state.workspaceOrder).toEqual([repoB.path, repoA.path]);
    expect(state.groups[repoB.path]?.comparisonKeys).toEqual([]);
    expect(state.activeKey).toBe(keyA);
  });

  test("CLI paths missing from opened workspaces are skipped", () => {
    const state = buildInitialState(
      opened(repoA, ["main", "feature"]),
      [opened(repoA, ["main", "feature"])],
      DEFAULT_SETTINGS,
      ["/repos/missing/", repoA.path],
    );
    expect(state.workspaceOrder).toEqual([repoA.path]);
    expect(state.activeKey).toBe(keyA);
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
