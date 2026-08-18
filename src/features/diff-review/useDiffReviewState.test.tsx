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

import { describe, expect, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useDiffReviewState } = await import("./DiffReviewProvider");

type HookApi = ReturnType<typeof useDiffReviewState>;

const KEY_A = "/repo|main|a";
const KEY_B = "/repo|main|b";

type ReviewArgs = {
  activeKey: string | null;
  mergeBaseOid: string;
  openKeys: ReadonlySet<string>;
};

function mountReview(args: ReviewArgs): {
  get: () => HookApi;
  setArgs: (next: Partial<ReviewArgs>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: HookApi | null = null;
  let setProps: ((p: ReviewArgs) => void) | null = null;

  function Harness({ props }: { props: ReviewArgs }) {
    const api = useDiffReviewState(props);
    latest = api;
    return null;
  }

  function Host({ initial }: { initial: ReviewArgs }) {
    const [props, set] = useState(initial);
    useEffect(() => {
      setProps = set;
    }, []);
    return <Harness props={props} />;
  }

  act(() => {
    root.render(<Host initial={args} />);
  });

  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    setArgs: (next) => {
      act(() => {
        setProps?.((prev) => ({ ...prev, ...next }));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useDiffReviewState", () => {
  test("evicts viewed paths when the active key leaves openKeys", () => {
    const h = mountReview({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });

    act(() => {
      h.get().handleViewedChange("src/a.ts", true);
    });
    expect(h.get().viewedPaths.has("src/a.ts")).toBe(true);

    h.setArgs({ openKeys: new Set([KEY_B]) });
    expect(h.get().viewedPaths.size).toBe(0);
    h.unmount();
  });

  test("dropping another key does not clear the active viewed set", () => {
    const h = mountReview({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });

    act(() => {
      h.get().handleViewedChange("src/a.ts", true);
    });
    expect(h.get().viewedPaths.has("src/a.ts")).toBe(true);

    h.setArgs({ openKeys: new Set([KEY_A]) });
    expect(h.get().viewedPaths.has("src/a.ts")).toBe(true);
    h.unmount();
  });
});
