import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/features/branch-compare/BranchComparePalette", () => ({
  BranchComparePalette({
    open,
    onOpenChange,
    head,
    base,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    head?: string;
    base?: string;
  }) {
    return (
      <div data-open={String(open)} data-head={head} data-base={base}>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close palette
        </button>
      </div>
    );
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { TopBar } = await import("./TopBar");
const { RepoSessionContext } = await import("@/features/repo-session/context");
import { historyLaneClient } from "@/features/history/useHistoryLane";
import type { HistorySlice } from "@/features/history/historyModel";
import type { ComparisonRow } from "@/features/repo-session/types";
import type { RepoSessionValue } from "@/features/repo-session/useRepoSession";
import type { RepoInfo } from "@/shared/types/app";

const originalHistoryLoad = historyLaneClient.load;

const repo: RepoInfo = {
  path: "/repos/demo",
  name: "demo",
  headBranch: "feature",
  defaultBase: "main",
};

function session(overrides: Partial<RepoSessionValue> = {}): RepoSessionValue {
  const asyncNoop = async () => {};
  return {
    repo,
    branches: ["main", "feature"],
    baseBranch: "main",
    headBranch: "feature",
    overview: null,
    fileDiffs: [],
    branchMetadata: [],
    metadataLoading: false,
    branchLoading: false,
    branchError: null,
    refreshOverview: asyncNoop,
    handleComparisonChange: asyncNoop,
    loadBranches: asyncNoop,
    loadBranchMetadata: asyncNoop,
    ...overrides,
  } as RepoSessionValue;
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

function renderTopBar(
  paletteOpenRequest: number,
  sessionValue: RepoSessionValue = session(),
  startupError: string | null = null,
) {
  act(() => {
    root.render(
      <RepoSessionContext.Provider value={sessionValue}>
        <TopBar
          onOpenSettings={noopSettings}
          paletteOpenRequest={paletteOpenRequest}
          startupError={startupError}
        />
      </RepoSessionContext.Provider>,
    );
  });
}

function noopSettings() {}

function paletteOpenAttr() {
  return container.querySelector("[data-open]")?.getAttribute("data-open");
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  historyLaneClient.load = originalHistoryLoad;
  act(() => root.unmount());
  container.remove();
});

describe("TopBar paletteOpenRequest", () => {
  test("stale remount with a leftover token stays closed", () => {
    renderTopBar(4);
    expect(paletteOpenAttr()).toBe("false");
    act(() => root.unmount());
    root = createRoot(container);
    renderTopBar(4);
    expect(paletteOpenAttr()).toBe("false");
  });

  test("increment opens; close then increment opens again", () => {
    renderTopBar(4);
    expect(paletteOpenAttr()).toBe("false");
    renderTopBar(5);
    expect(paletteOpenAttr()).toBe("true");

    const close = container.querySelector("[data-open] button") as HTMLButtonElement;
    act(() => {
      close.click();
    });
    expect(paletteOpenAttr()).toBe("false");

    renderTopBar(6);
    expect(paletteOpenAttr()).toBe("true");
  });

  test("first session increment from 0 opens", () => {
    renderTopBar(0);
    expect(paletteOpenAttr()).toBe("false");
    renderTopBar(1);
    expect(paletteOpenAttr()).toBe("true");
  });
});

describe("TopBar refresh", () => {
  test("shows the loader inside the refresh button", () => {
    renderTopBar(0, session({ branchLoading: true }));
    const refresh = container.querySelector(
      'button.icon-btn[aria-label="Refreshing…"]',
    );
    expect(refresh?.classList.contains("is-busy")).toBe(true);
    expect(refresh?.querySelector(".icon-btn-spinner")).toBeTruthy();
    expect(container.querySelector(".top-bar-spinner")).toBeNull();
    expect(refresh?.hasAttribute("disabled")).toBe(false);
  });

  test("shows a startup open error", () => {
    renderTopBar(0, session(), "/typo: not a git repository");
    expect(container.textContent).toContain(
      "Could not open: /typo: not a git repository",
    );
  });
});

describe("TopBar graph", () => {
  test("shows a Graph control when a repo is in session", () => {
    renderTopBar(0);
    const graph = container.querySelector(
      'button.icon-btn[aria-label="Graph"]',
    );
    expect(graph).toBeTruthy();
    expect(graph?.getAttribute("aria-expanded")).toBe("false");
    expect(graph?.hasAttribute("disabled")).toBe(false);
  });

  test("hides Graph when no repo is in session", () => {
    renderTopBar(0, session({ repo: null }));
    expect(
      container.querySelector('button.icon-btn[aria-label="Graph"]'),
    ).toBeNull();
  });

  test("a history slice titles the bar and keeps branch names on the palette", () => {
    const history: HistorySlice = {
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "parent-oid",
      specHead: "commit-oid",
      kind: "commit",
      label: "Anchor the popover",
      short: "midoid1",
      detail: "Only midoid1.",
      baseLabel: "main",
    };
    const sliceKey = "slice-key";
    const slice = {
      key: sliceKey,
      repoPath: repo.path,
      baseBranch: "main",
      headBranch: "feature",
      history,
    } as ComparisonRow;
    const load = mock(() => new Promise<never>(() => {}));
    historyLaneClient.load = load;
    renderTopBar(
      0,
      session({
        baseBranch: "main",
        headBranch: "feature",
        activeKey: sliceKey,
        comparisons: { [sliceKey]: slice },
      }),
    );
    expect(container.querySelector(".topbar-title")?.textContent).toBe(
      "Anchor the popover",
    );
    expect(container.querySelector(".topbar-lead")?.textContent).toBe(
      "Only midoid1.",
    );
    expect(container.querySelector("[data-head]")?.getAttribute("data-head")).toBe(
      "feature",
    );
    expect(container.querySelector("[data-base]")?.getAttribute("data-base")).toBe(
      "main",
    );
    const graph = container.querySelector(
      'button.icon-btn[aria-label="Graph"]',
    ) as HTMLButtonElement;
    act(() => {
      graph.click();
    });
    expect(load).toHaveBeenCalledWith(repo.path, "main", "feature");
    expect(load.mock.calls.some((call) => call.includes("parent-oid"))).toBe(false);
    expect(load.mock.calls.some((call) => call.includes("commit-oid"))).toBe(false);
  });

  test("Graph opens history for the source branches", () => {
    const load = mock(() => new Promise<never>(() => {}));
    historyLaneClient.load = load;
    renderTopBar(0);
    const graph = container.querySelector(
      'button.icon-btn[aria-label="Graph"]',
    ) as HTMLButtonElement;
    act(() => {
      graph.click();
    });
    expect(load).toHaveBeenCalledWith("/repos/demo", "main", "feature");
    expect(container.textContent).toContain("Loading history.");
  });
});
