import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CompareGraphSvg } = await import("./CompareGraphSvg");
import { GRAPH_LAYOUT } from "./graphLayout";
import type { GraphTopology } from "./graphTopology";

function topology(kind: GraphTopology["kind"]): GraphTopology {
  return {
    kind,
    title: kind,
    detail: "",
    ahead: 0,
    behind: kind === "behind" ? 3 : 0,
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
      root.render(
        <CompareGraphSvg topology={topology("sync")} isLive={false} />,
      );
    });
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelectorAll('[data-graph-node="merge-base"]')).toHaveLength(
      1,
    );
    expect(container.querySelector('[data-graph-node="head"]')).toBeNull();
    expect(container.textContent).toContain("HEAD");
    expect(container.textContent).toContain("merge-base");
  });

  test("behind does not stack a node on the merge-base diamond", () => {
    act(() => {
      root.render(
        <CompareGraphSvg topology={topology("behind")} isLive={false} />,
      );
    });
    const filled = [...container.querySelectorAll("circle")].filter(
      (el) => el.getAttribute("fill") && el.getAttribute("fill") !== "none",
    );
    const onDiamond = filled.filter((el) => {
      const cx = Number(el.getAttribute("cx"));
      const cy = Number(el.getAttribute("cy"));
      return (
        Math.abs(cx - GRAPH_LAYOUT.xAhead) < 0.5 &&
        Math.abs(cy - GRAPH_LAYOUT.yBase) < 0.5
      );
    });
    expect(onDiamond).toHaveLength(0);
    expect(container.querySelector('[data-graph-node="merge-base"]')).toBeTruthy();
    expect(container.querySelector('[data-graph-node="head"]')).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });
});
