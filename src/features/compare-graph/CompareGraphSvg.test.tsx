import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CompareGraphSvg } = await import("./CompareGraphSvg");
import type { GraphTopology } from "./graphTopology";

function topology(kind: GraphTopology["kind"]): GraphTopology {
  switch (kind) {
    case "behind":
      return { kind: "behind", behind: 3, baseLabel: "main" };
    case "linear":
      return { kind: "linear", ahead: 4, baseLabel: "main" };
    case "diverged":
      return { kind: "diverged", ahead: 4, behind: 2, baseLabel: "main" };
    case "sync":
      return { kind: "sync", baseLabel: "main" };
    case "unknown":
      return { kind: "unknown", baseLabel: "main" };
  }
}

function unlabeledDots(root: HTMLElement) {
  return [...root.querySelectorAll("circle")].filter(
    (el) =>
      el.getAttribute("fill") &&
      el.getAttribute("fill") !== "none" &&
      !el.getAttribute("data-graph-node"),
  );
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
    const merge = container.querySelector('[data-graph-node="merge-base"]')!;
    const mx =
      Number(merge.getAttribute("x")) + Number(merge.getAttribute("width")) / 2;
    const my =
      Number(merge.getAttribute("y")) + Number(merge.getAttribute("height")) / 2;
    const filled = [...container.querySelectorAll("circle")].filter(
      (el) => el.getAttribute("fill") && el.getAttribute("fill") !== "none",
    );
    const onDiamond = filled.filter((el) => {
      const cx = Number(el.getAttribute("cx"));
      const cy = Number(el.getAttribute("cy"));
      return Math.abs(cx - mx) < 0.5 && Math.abs(cy - my) < 0.5;
    });
    expect(onDiamond).toHaveLength(0);
    expect(container.querySelector('[data-graph-node="merge-base"]')).toBeTruthy();
    expect(container.querySelector('[data-graph-node="head"]')).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });

  test("live sync draws a WIP ring on the merge-base", () => {
    act(() => {
      root.render(<CompareGraphSvg topology={topology("sync")} isLive />);
    });
    expect(container.querySelector('[data-graph-node="wip"]')).toBeTruthy();
  });

  test("one ahead commit draws the tip only", () => {
    act(() => {
      root.render(
        <CompareGraphSvg
          topology={{ kind: "linear", ahead: 1, baseLabel: "main" }}
          isLive={false}
        />,
      );
    });
    expect(unlabeledDots(container)).toHaveLength(0);
    expect(container.querySelector('[data-graph-node="head"]')).toBeTruthy();
  });

  test("caps unlabelled dots on a long lane", () => {
    act(() => {
      root.render(
        <CompareGraphSvg
          topology={{
            kind: "diverged",
            ahead: 20,
            behind: 15,
            baseLabel: "main",
          }}
          isLive={false}
        />,
      );
    });
    expect(unlabeledDots(container)).toHaveLength(16);
    expect(container.querySelectorAll('[data-graph-node="head"]')).toHaveLength(2);
    expect(container.querySelector('[data-graph-node="merge-base"]')).toBeTruthy();
  });
});
