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
const originalScroll = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  HTMLElement.prototype.scrollIntoView = originalScroll;
});

function renderLane(
  onSelect: (index: number, mode: "range" | "commit") => void,
  props: { selectedHead?: string | null; mode?: "range" | "commit" } = {},
) {
  act(() => {
    root.render(
      <dialog open>
        <HistoryLane
          nodes={nodes}
          mode={props.mode ?? "range"}
          selectedHead={props.selectedHead ?? null}
          sourceBase="main"
          sourceHead="feature"
          headOid="tip-oid"
          mergeBase="base-oid"
          truncated={false}
          nowSeconds={1_700_000_400}
          onSelect={onSelect}
        />
      </dialog>,
    );
  });
}

describe("HistoryLane", () => {
  test("a row click selects that commit once in the current mode", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect);
    const row = container.querySelector('[data-history-index="2"]');
    expect(row?.textContent).toContain("Anchor the popover");
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2, "range");
  });

  test("This commit reports the commit mode once for the current row", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect, { selectedHead: "mid-oid" });
    const button = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("This commit"),
    );
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2, "commit");
  });

  test("dragging updates the highlight and selects once on pointer up", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect);
    const track = container.querySelector(".history-track") as HTMLElement;
    const down = new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientY: 10,
    });
    const move = new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientY: 180,
    });
    const up = new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      clientY: 180,
    });
    act(() => {
      track.dispatchEvent(down);
      track.dispatchEvent(move);
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(track.querySelector('[aria-selected="true"]')?.getAttribute("data-history-index")).toBe(
      "3",
    );
    act(() => {
      track.dispatchEvent(up);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(3, "range");
  });

  test("arrow keys move the lane from the dialog and ignore the window", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(onSelect).not.toHaveBeenCalled();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    act(() => {
      outside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(onSelect).not.toHaveBeenCalled();
    outside.remove();

    const dialog = container.querySelector("dialog")!;
    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1, "range");
  });

  function segmentChecked(label: string): string | null {
    const button = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes(label),
    );
    return button?.getAttribute("aria-checked") ?? null;
  }

  test("local slice mode follows a later mode prop", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect, { mode: "range" });
    const commitButton = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("This commit"),
    );
    act(() => {
      commitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(segmentChecked("This commit")).toBe("true");

    renderLane(onSelect, { mode: "commit" });
    expect(segmentChecked("This commit")).toBe("true");

    renderLane(onSelect, { mode: "range" });
    expect(segmentChecked("Through here")).toBe("true");
    expect(segmentChecked("This commit")).toBe("false");
  });

  test("the selected commit is the only tab stop", () => {
    renderLane(mock(() => {}), { selectedHead: "mid-oid" });
    const tabs = [...container.querySelectorAll('[role="option"]')].map((row) =>
      row.getAttribute("tabindex"),
    );
    expect(tabs).toEqual(["-1", "-1", "0", "-1"]);
  });

  test("arrow keys from a commit row move focus with the playhead", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect, { selectedHead: "mid-oid" });
    const current = container.querySelector('[data-history-index="2"]') as HTMLElement;
    current.focus();
    act(() => {
      current.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    const next = container.querySelector('[data-history-index="3"]') as HTMLElement;
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(3, "range");
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("tabindex")).toBe("0");
    expect(current.getAttribute("tabindex")).toBe("-1");
  });

  test("enter selects the focused commit row", () => {
    const onSelect = mock(() => {});
    renderLane(onSelect);
    const row = container.querySelector('[data-history-index="2"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2, "range");
  });

  test("a committed row scrolls into view", () => {
    const scrolled: string[] = [];
    HTMLElement.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement) {
      const index = this.getAttribute("data-history-index");
      if (index != null) scrolled.push(index);
    };
    const onSelect = mock(() => {});
    renderLane(onSelect);
    const row = container.querySelector('[data-history-index="2"]');
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(scrolled).toContain("2");
  });
});
