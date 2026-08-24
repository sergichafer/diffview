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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CompareGraphSvg } = await import("./CompareGraphSvg");
import type { GraphTopology } from "./graphTopology";

const VIEW_H = 220;
const Y0 = 22;
const Y1 = VIEW_H - 28;
const X_AHEAD = 248 * 0.36;

function topology(kind: GraphTopology["kind"]): GraphTopology {
  return {
    kind,
    title: kind,
    detail: "",
    caption: kind,
    ahead: 0,
    behind: kind === "behind" ? 3 : 0,
    isLive: false,
    baseLabel: "main",
    drawnAhead: 0,
    drawnBehind: kind === "behind" ? 2 : 0,
    hasMetadata: true,
  };
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CompareGraphSvg", () => {
  test("sync is one commit, not a full-height lane", () => {
    act(() => {
      root.render(<CompareGraphSvg topology={topology("sync")} />);
    });
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelectorAll("rect")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.textContent).toContain("HEAD");
    expect(container.textContent).toContain("merge-base");
  });

  test("behind does not stack a node on the merge-base diamond", () => {
    act(() => {
      root.render(<CompareGraphSvg topology={topology("behind")} />);
    });
    const filled = [...container.querySelectorAll("circle")].filter(
      (el) => el.getAttribute("fill") && el.getAttribute("fill") !== "none",
    );
    const onDiamond = filled.filter((el) => {
      const cx = Number(el.getAttribute("cx"));
      const cy = Number(el.getAttribute("cy"));
      return Math.abs(cx - X_AHEAD) < 0.5 && Math.abs(cy - Y1) < 0.5;
    });
    expect(onDiamond).toHaveLength(0);
    expect(container.querySelector("rect")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });
});
