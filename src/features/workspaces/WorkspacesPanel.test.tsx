import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: async () => null,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { WorkspacesPanel } = await import("./WorkspacesPanel");
const { RepoSessionContext } = await import("@/features/repo-session/context");
const { makeComparisonKey } = await import("@/features/branch-compare/comparisonKey");
import type { RepoSessionValue } from "@/features/repo-session/useRepoSession";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import type { BranchOverview, FileDiffResult, RepoInfo } from "@/shared/types/app";

const repo: RepoInfo = {
  path: "/repos/demo",
  name: "demo",
  headBranch: "feature/panels-seams",
  defaultBase: "main",
};

const liveKey = makeComparisonKey(repo.path, "main", "feature/panels-seams");
const frozenKey = makeComparisonKey(repo.path, "main", "release/1.2");

const WIP_TITLE =
  "WIP: checked-out head. Diffs and saves write the working tree.";

function overview(files: number, isLive: boolean): BranchOverview {
  return {
    repoPath: repo.path,
    currentBranch: repo.headBranch,
    baseBranch: "main",
    mergeBase: "abc",
    headOid: "head1",
    isLive,
    files: Array.from({ length: files }, (_, i) => ({
      path: `f${i}.ts`,
      badges: ["committed"],
      isBinary: false,
    })),
  };
}

function patchStat(additions: number, deletions: number): string {
  const lines = ["--- a/f", "+++ b/f"];
  for (let i = 0; i < deletions; i++) lines.push("-x");
  for (let i = 0; i < additions; i++) lines.push("+y");
  return lines.join("\n");
}

function diffs(additions: number, deletions: number): FileDiffResult[] {
  return [{ path: "f0.ts", patch: patchStat(additions, deletions), isBinary: false, oldPath: null }];
}

function row(partial: Partial<ComparisonRow> & Pick<ComparisonRow, "key" | "headBranch">): ComparisonRow {
  return {
    repoPath: repo.path,
    baseBranch: "main",
    residency: "warm",
    overview: overview(12, false),
    fileDiffs: [],
    loading: false,
    error: null,
    mergeBaseOid: "abc",
    headOid: "head1",
    isLive: false,
    outdated: false,
    ...partial,
  };
}

function group(comparisonKeys: string[], collapsed = false): WorkspaceGroup {
  return {
    repo,
    branches: ["main", "feature/panels-seams", "release/1.2"],
    collapsed,
    comparisonKeys,
    branchMetadata: [],
    metadataLoading: false,
  };
}

function session(overrides: Partial<RepoSessionValue> = {}): RepoSessionValue {
  const noop = () => {};
  const asyncNoop = async () => {};
  const live = row({
    key: liveKey,
    headBranch: "feature/panels-seams",
    isLive: true,
    overview: overview(12, true),
  });
  return {
    workspaceOrder: [repo.path],
    groups: { [repo.path]: group([liveKey]) },
    comparisons: { [liveKey]: live },
    activeKey: liveKey,
    columnCollapsed: false,
    mruKeys: [liveKey],
    repo,
    branches: group([liveKey]).branches,
    baseBranch: "main",
    headBranch: live.headBranch,
    overview: live.overview,
    fileDiffs: [],
    branchLoading: false,
    branchError: null,
    branchMetadata: [],
    metadataLoading: false,
    activeMergeBase: "abc",
    workspaces: [{ id: repo.path, group: group([liveKey]) }],
    refreshOverview: asyncNoop,
    refreshOverviewMeta: asyncNoop,
    openRepo: asyncNoop,
    closeRepo: noop,
    closeWorkspace: asyncNoop,
    closeComparison: noop,
    activateComparison: noop,
    spawnComparison: noop,
    addWorkspace: asyncNoop,
    toggleGroupCollapsed: noop,
    setColumnCollapsed: noop,
    handleComparisonChange: asyncNoop,
    loadBranches: asyncNoop,
    loadBranchMetadata: asyncNoop,
    ...overrides,
  } as RepoSessionValue;
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

function renderPanel(
  value: RepoSessionValue,
  onRequestPalette: () => void = () => {},
) {
  act(() => {
    root.render(
      <RepoSessionContext.Provider value={value}>
        <WorkspacesPanel
          width={240}
          onRequestPalette={onRequestPalette}
          panelFocused={true}
          onPanelFocusChange={() => {}}
        />
      </RepoSessionContext.Provider>,
    );
  });
  return container;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WorkspacesPanel Hang row", () => {
  test("live comparison shows the word WIP", () => {
    renderPanel(session());
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).toContain("WIP");
    const wip = comparison?.querySelector(".workspaces-wip");
    expect(wip?.getAttribute("title")).toBe(WIP_TITLE);
  });

  test("frozen comparison shows destination without WIP", () => {
    const frozen = row({
      key: frozenKey,
      headBranch: "release/1.2",
      isLive: false,
      overview: overview(4, false),
    });
    renderPanel(
      session({
        workspaces: [{ id: repo.path, group: group([frozenKey]) }],
        comparisons: { [frozenKey]: frozen },
        activeKey: frozenKey,
        mruKeys: [frozenKey],
      }),
    );
    const comparison = container.querySelector(`[data-ws-key="${frozenKey}"]`);
    expect(comparison?.textContent).toContain("release/1.2");
    expect(comparison?.textContent).toContain("→");
    expect(comparison?.textContent).toContain("main");
    expect(comparison?.textContent).not.toContain("WIP");
  });

  test("warm row keeps the file count and hides +/−", () => {
    renderPanel(session());
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).toContain("12 files");
    expect(comparison?.querySelector(".workspaces-stat-changes")?.textContent?.trim()).toBe("");
  });

  test("hot row keeps the file count and shows centered +/−", () => {
    const hot = row({
      key: liveKey,
      headBranch: "feature/panels-seams",
      isLive: true,
      residency: "hot",
      overview: overview(12, true),
      fileDiffs: diffs(318, 91),
    });
    renderPanel(
      session({
        comparisons: { [liveKey]: hot },
        fileDiffs: hot.fileDiffs,
      }),
    );
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).toContain("12 files");
    expect(comparison?.querySelector(".workspaces-add")?.textContent).toBe("+318");
    expect(comparison?.querySelector(".workspaces-del")?.textContent).toBe("−91");
  });

  test("loading a warm row keeps the file count and puts a status spinner in the +/− slot", () => {
    const loading = row({
      key: liveKey,
      headBranch: "feature/panels-seams",
      isLive: true,
      residency: "warm",
      loading: true,
      overview: overview(12, true),
    });
    renderPanel(session({ comparisons: { [liveKey]: loading } }));
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).toContain("12 files");
    const spinner = comparison?.querySelector('.workspaces-stat-changes [role="status"]');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute("aria-label")).toBe("Loading diffstat");
    expect(comparison?.querySelector(".workspaces-add")).toBeNull();
  });

  test("outdated status stays on the destination line as a word", () => {
    const stale = row({
      key: liveKey,
      headBranch: "feature/panels-seams",
      isLive: true,
      outdated: true,
      overview: overview(12, true),
    });
    renderPanel(session({ comparisons: { [liveKey]: stale } }));
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).toContain("Outdated");
    const chip = comparison?.querySelector(".workspaces-chip-stale");
    expect(chip?.getAttribute("title")).toBe(
      "Outdated: refs moved while idle. Recalculates on visit.",
    );
  });

  test("cold loading shows a status spinner in the +/− slot without a file count", () => {
    const cold = row({
      key: liveKey,
      headBranch: "feature/panels-seams",
      isLive: true,
      residency: "cold",
      loading: true,
      overview: null,
      fileDiffs: [],
    });
    renderPanel(session({ comparisons: { [liveKey]: cold } }));
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.textContent).not.toContain("files");
    const spinner = comparison?.querySelector('.workspaces-stat-changes [role="status"]');
    expect(spinner?.getAttribute("aria-label")).toBe("Loading comparison");
  });
});

describe("WorkspacesPanel Press feel", () => {
  test("pointer-down highlights a comparison row until pointer-up", () => {
    renderPanel(session());
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison).toBeTruthy();
    act(() => {
      comparison!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }),
      );
    });
    expect(comparison!.classList.contains("is-pressed")).toBe(true);
    act(() => {
      comparison!.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }),
      );
    });
    expect(comparison!.classList.contains("is-pressed")).toBe(false);
  });

  test("collapsed group keeps comparison rows mounted", () => {
    renderPanel(
      session({
        workspaces: [{ id: repo.path, group: group([liveKey], true) }],
      }),
    );
    const groupRow = container.querySelector(`[data-ws-key="${repo.path}"]`);
    expect(groupRow?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(`[data-ws-key="${liveKey}"]`)).toBeTruthy();
  });

  test("collapsed column keeps Hang rows and shows rail glyphs on the same tree", () => {
    renderPanel(session({ columnCollapsed: true }));
    expect(container.querySelector(`[data-ws-key="${liveKey}"]`)).toBeTruthy();
    expect(container.querySelector(".workspaces-rail-glyph")?.textContent).toContain("D");
    expect(container.querySelector('[aria-label="Expand workspaces"]')).toBeTruthy();
  });

  test("keyboard tree still moves focus between group and comparison", () => {
    renderPanel(session());
    const tree = container.querySelector('[role="tree"]');
    const comparison = container.querySelector(`[data-ws-key="${liveKey}"]`);
    expect(comparison?.getAttribute("tabindex")).toBe("0");
    act(() => {
      tree!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(
      container.querySelector(`[data-ws-key="${repo.path}"]`)?.getAttribute("tabindex"),
    ).toBe("0");
    expect(comparison?.getAttribute("tabindex")).toBe("-1");
  });

  test("comparison close button evicts the cache row", () => {
    const closeComparison = mock(() => {});
    renderPanel(session({ closeComparison }));
    const btn = container.querySelector(
      '[aria-label="Close comparison feature/panels-seams to main"]',
    );
    act(() => {
      (btn as HTMLButtonElement).click();
    });
    expect(closeComparison).toHaveBeenCalledWith(liveKey);
  });

  test("pointer-down highlights a group row until pointer-up", () => {
    renderPanel(session());
    const groupRow = container.querySelector(`[data-ws-key="${repo.path}"]`);
    expect(groupRow).toBeTruthy();
    act(() => {
      groupRow!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }),
      );
    });
    expect(groupRow!.classList.contains("is-pressed")).toBe(true);
    act(() => {
      groupRow!.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }),
      );
    });
    expect(groupRow!.classList.contains("is-pressed")).toBe(false);
  });
});

function frozenRow(): ComparisonRow {
  return row({
    key: frozenKey,
    headBranch: "release/1.2",
    isLive: false,
    overview: overview(4, false),
  });
}

function twoKeySession(overrides: Partial<RepoSessionValue> = {}): RepoSessionValue {
  const live = session().comparisons[liveKey]!;
  const frozen = frozenRow();
  return session({
    workspaces: [{ id: repo.path, group: group([liveKey, frozenKey]) }],
    comparisons: { [liveKey]: live, [frozenKey]: frozen },
    activeKey: liveKey,
    mruKeys: [liveKey, frozenKey],
    ...overrides,
  });
}

function dispatchWindowKey(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("WorkspacesPanel window shortcuts", () => {
  test("Ctrl+Tab cycles MRU keys and wraps", () => {
    const activateComparison = mock(() => {});
    renderPanel(twoKeySession({ activateComparison, activeKey: liveKey }));
    dispatchWindowKey({ key: "Tab", ctrlKey: true });
    expect(activateComparison).toHaveBeenCalledWith(frozenKey);

    renderPanel(twoKeySession({ activateComparison, activeKey: frozenKey }));
    dispatchWindowKey({ key: "Tab", ctrlKey: true });
    expect(activateComparison).toHaveBeenLastCalledWith(liveKey);
  });

  test("Cmd+Tab cycles MRU keys and wraps", () => {
    const activateComparison = mock(() => {});
    renderPanel(twoKeySession({ activateComparison, activeKey: liveKey }));
    dispatchWindowKey({ key: "Tab", metaKey: true });
    expect(activateComparison).toHaveBeenCalledWith(frozenKey);

    renderPanel(twoKeySession({ activateComparison, activeKey: frozenKey }));
    dispatchWindowKey({ key: "Tab", metaKey: true });
    expect(activateComparison).toHaveBeenLastCalledWith(liveKey);
  });

  test("Ctrl+2 activates the second visible comparison", () => {
    const activateComparison = mock(() => {});
    renderPanel(twoKeySession({ activateComparison }));
    const event = dispatchWindowKey({ key: "2", ctrlKey: true });
    expect(activateComparison).toHaveBeenCalledWith(frozenKey);
    expect(event.defaultPrevented).toBe(true);
  });

  test("Ctrl+1 does not activate comparisons in a collapsed group", () => {
    const activateComparison = mock(() => {});
    renderPanel(
      twoKeySession({
        activateComparison,
        workspaces: [{ id: repo.path, group: group([liveKey, frozenKey], true) }],
      }),
    );
    const event = dispatchWindowKey({ key: "1", ctrlKey: true });
    expect(activateComparison).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("WorkspacesPanel rail", () => {
  test("glyph click activates the MRU comparison, not the first group key", () => {
    const activateComparison = mock(() => {});
    renderPanel(
      twoKeySession({
        activateComparison,
        columnCollapsed: true,
        workspaces: [{ id: repo.path, group: group([frozenKey, liveKey]) }],
        mruKeys: [liveKey, frozenKey],
      }),
    );
    const glyph = container.querySelector(".workspaces-rail-glyph") as HTMLButtonElement;
    act(() => {
      glyph.click();
    });
    expect(activateComparison).toHaveBeenCalledWith(liveKey);
    expect(activateComparison).not.toHaveBeenCalledWith(frozenKey);
  });
});

describe("WorkspacesPanel empty group", () => {
  test("New comparison seeds a default comparison then opens the palette", () => {
    const spawnComparison = mock(
      (_id: string, _base: string, _head: string) => {},
    );
    const onRequestPalette = mock(() => {});
    renderPanel(
      session({
        workspaces: [{ id: repo.path, group: group([]) }],
        groups: { [repo.path]: group([]) },
        comparisons: {},
        activeKey: null,
        mruKeys: [],
        spawnComparison,
      }),
      onRequestPalette,
    );
    const add = container.querySelector(
      `button[aria-label="New comparison in ${repo.name}"]`,
    ) as HTMLButtonElement | null;
    expect(add).toBeTruthy();
    act(() => {
      add!.click();
    });
    expect(spawnComparison).toHaveBeenCalledWith(
      repo.path,
      "main",
      "feature/panels-seams",
    );
    expect(onRequestPalette).toHaveBeenCalled();
  });
});
