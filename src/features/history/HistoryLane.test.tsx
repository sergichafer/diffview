import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { HistoryNode } from "./historyModel";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { HistoryLane } = await import("./HistoryLane");

const nodes: HistoryNode[] = [
  { kind: "wip", id: "wip" },
  {
    kind: "commit",
    id: "tip-oid",
    oid: "tip-oid",
    short: "tipoid1",
    subject: "Keep the lane schematic",
    parent: "mid-oid",
    time: 1_700_000_300,
    tip: true,
  },
  {
    kind: "commit",
    id: "mid-oid",
    oid: "mid-oid",
    short: "midoid1",
    subject: "Anchor the popover",
    parent: "base-oid",
    time: 1_700_000_100,
    tip: false,
  },
  { kind: "base", id: "base", oid: "base-oid", label: "main" },
];

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

describe("HistoryLane", () => {
  test("a row click selects that commit in the current mode", () => {
    const onSelect = mock(() => {});
    act(() => {
      root.render(
        <HistoryLane
          nodes={nodes}
          mode="range"
          selectedHead={null}
          baseBranch="main"
          headOid="tip-oid"
          mergeBase="base-oid"
          truncated={false}
          nowSeconds={1_700_000_400}
          onMode={() => {}}
          onSelect={onSelect}
        />,
      );
    });
    const row = container.querySelector('[data-history-index="2"]');
    expect(row?.textContent).toContain("Anchor the popover");
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(2, "range");
  });

  test("This commit reports the commit mode for the current row", () => {
    const onSelect = mock(() => {});
    act(() => {
      root.render(
        <HistoryLane
          nodes={nodes}
          mode="range"
          selectedHead="mid-oid"
          baseBranch="main"
          headOid="tip-oid"
          mergeBase="base-oid"
          truncated={false}
          nowSeconds={1_700_000_400}
          onMode={() => {}}
          onSelect={onSelect}
        />,
      );
    });
    const button = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("This commit"),
    );
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(2, "commit");
  });
});
