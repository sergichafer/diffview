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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useDiffWorkspace } = await import("./useDiffWorkspace");

import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import type { CodeViewHandle } from "@pierre/diffs/react";

function makeFakeCodeView() {
  const state = { scrollTop: 0, tops: new Map<string, number>() };
  const viewer = {
    getTopForItem: (id: string) => state.tops.get(id),
    getScrollTop: () => state.scrollTop,
    getScrollHeight: () => 100000,
    getItem: (_id: string) => null,
    updateItem: (_item: unknown) => {},
  };
  const handle = {
    getInstance: () => viewer,
    scrollTo: (cmd: { type: string; position?: number }) => {
      if (cmd.type === "position" && typeof cmd.position === "number") {
        state.scrollTop = cmd.position;
      }
    },
  } as unknown as CodeViewHandle<undefined>;
  return { state, viewer, handle };
}

function patchFor(path: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    "index 0000000..1111111 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -0,0 +1 @@",
    "+hello",
    "",
  ].join("\n");
}

const file = (path: string): ChangedFile => ({
  path,
  badges: ["committed"],
  isBinary: false,
});
const diff = (path: string): FileDiffResult => ({
  path,
  patch: patchFor(path),
  isBinary: false,
  oldPath: null,
});

const files = ["a.ts", "b.ts", "c.ts"].map(file);
const fileDiffs = files.map((f) => diff(f.path));
const tops = new Map([
  ["a.ts", 0],
  ["b.ts", 400],
  ["c.ts", 800],
]);

type Workspace = ReturnType<typeof useDiffWorkspace>;

let rafId = 0;
const rafPending = new Map<number, FrameRequestCallback>();

function flushFrames(count = 1) {
  for (let i = 0; i < count; i++) {
    const batch = [...rafPending.values()];
    rafPending.clear();
    act(() => {
      for (const cb of batch) cb(0);
    });
  }
}

function mountWorkspace(handle: CodeViewHandle<undefined>): {
  get: () => Workspace;
  bump: () => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Workspace | null = null;
  let setNonce: ((n: number) => void) | null = null;

  function Harness() {
    const [, set] = useState(0);
    setNonce = set;
    const [selectedPath, setSelectedPath] = useState<string | null>("c.ts");
    const codeViewRef = useRef(handle);
    const workspace = useDiffWorkspace({
      fileDiffs,
      files,
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      selectedPath,
      setSelectedPath,
      codeViewRef,
      workerPool: null,
      comparisonKey: "/repo|main|feature",
    });
    latest = workspace;
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });
  flushFrames(2);

  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    bump: () => {
      act(() => setNonce?.((n) => n + 1));
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("restoreRef lazy init vs fulfill", () => {
  beforeEach(() => {
    rafId = 0;
    rafPending.clear();
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafPending.set(id, cb);
      return id;
    };
    (globalThis as any).cancelAnimationFrame = (id: number) => {
      rafPending.delete(id);
    };
  });

  afterEach(() => {
    rafPending.clear();
  });

  test("panel remount after fulfill still scrolls to the seed", () => {
    const fake = makeFakeCodeView();
    fake.state.tops = new Map(tops);
    const h = mountWorkspace(fake.handle);
    expect(fake.state.scrollTop).toBe(800);

    fake.state.scrollTop = 0;
    act(() => {
      h.get().setPanelRef(null);
    });
    act(() => {
      h.get().setPanelRef(document.createElement("div"));
    });
    expect(fake.state.scrollTop).toBe(800);
    h.unmount();
  });

  test("rerender after fulfill without panel remount does not scroll again", () => {
    const fake = makeFakeCodeView();
    fake.state.tops = new Map(tops);
    const h = mountWorkspace(fake.handle);
    expect(fake.state.scrollTop).toBe(800);

    fake.state.scrollTop = 0;
    h.bump();
    expect(fake.state.scrollTop).toBe(0);
    h.unmount();
  });
});
