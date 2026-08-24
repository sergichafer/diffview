import { Window } from "happy-dom";

const dom = new Window();
for (const key of [
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "getComputedStyle",
  "DocumentFragment",
  "MutationObserver",
  "ResizeObserver",
] as const) {
  // @ts-expect-error assign dom globals
  if (globalThis[key] === undefined) globalThis[key] = dom[key];
}
(globalThis as any).window = dom;
(globalThis as any).document = dom.document;
(globalThis as any).navigator = dom.navigator;
(globalThis as any).customElements = dom.customElements;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof (globalThis as any).CSS === "undefined") {
  (globalThis as any).CSS = { escape: (s: string) => s };
}
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    Number(setTimeout(() => cb(Date.now()), 0));
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/features/branch-compare/BranchComparePalette", () => ({
  BranchComparePalette({
    open,
    onOpenChange,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) {
    return (
      <div data-open={String(open)}>
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
import type { RepoSessionValue } from "@/features/repo-session/useRepoSession";
import type { RepoInfo } from "@/shared/types/app";

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

  test("opens a non-modal compare graph dialog", () => {
    renderTopBar(0);
    const graph = container.querySelector(
      'button.icon-btn[aria-label="Graph"]',
    ) as HTMLButtonElement;
    act(() => {
      graph.click();
    });
    expect(graph.getAttribute("aria-expanded")).toBe("true");
    const dialog = container.querySelector(
      'dialog[aria-label="Compare graph"]',
    );
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBeNull();
    expect(container.textContent).toContain("In sync. 0 ahead, 0 behind.");
    expect(container.querySelector(".compare-backdrop")).toBeNull();
  });
});
