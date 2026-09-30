import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { HistorySlice } from "@/features/history/historyModel";
import { historyLaneClient } from "@/features/history/useHistoryLane";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CompareGraphPopover } = await import("./CompareGraphPopover");

const originalLoad = historyLaneClient.load;

let showCalls = 0;
let showModalCalls = 0;
const DialogProto = (globalThis as any).HTMLDialogElement?.prototype as
  | {
      show?: () => void;
      showModal?: () => void;
    }
  | undefined;
const originalShow = DialogProto?.show;
const originalShowModal = DialogProto?.showModal;

const lane = {
  mergeBase: "base-oid",
  headOid: "tip-oid",
  truncated: false,
  commits: [
    {
      oid: "tip-oid",
      short: "tipoid1",
      subject: "Keep the lane schematic",
      parent: "mid-oid",
      time: 1_700_000_300,
    },
    {
      oid: "mid-oid",
      short: "midoid1",
      subject: "Anchor the popover",
      parent: "base-oid",
      time: 1_700_000_200,
    },
  ],
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
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

function finishClose() {
  const dialog = panel();
  const WinEvent = (window as typeof window & { Event: typeof Event }).Event;
  act(() => {
    const event = new WinEvent("transitionend", { bubbles: true });
    Object.defineProperty(event, "propertyName", { value: "opacity" });
    dialog?.dispatchEvent(event);
  });
}

let restoreRaf = () => {};

beforeEach(() => {
  showCalls = 0;
  showModalCalls = 0;
  rafId = 0;
  rafPending.clear();
  historyLaneClient.load = () => new Promise(() => {});
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  restoreRaf = () => {
    globalThis.requestAnimationFrame = request;
    globalThis.cancelAnimationFrame = cancel;
  };
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafPending.set(id, cb);
    return id;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    rafPending.delete(id);
  };
  if (DialogProto) {
    DialogProto.show = function show(this: HTMLDialogElement) {
      showCalls += 1;
      this.setAttribute("open", "");
    };
    DialogProto.showModal = function showModal(this: HTMLDialogElement) {
      showModalCalls += 1;
      this.setAttribute("open", "");
    };
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreRaf();
  rafPending.clear();
  historyLaneClient.load = originalLoad;
  if (DialogProto) {
    if (originalShow) DialogProto.show = originalShow;
    else delete (DialogProto as { show?: () => void }).show;
    if (originalShowModal) DialogProto.showModal = originalShowModal;
    else delete (DialogProto as { showModal?: () => void }).showModal;
  }
});

function renderPopover(
  props: Partial<{
    repoPath: string;
    sourceBase: string;
    sourceHead: string;
    sourceIsLive: boolean;
    selectedHead: string | null;
    onSlice: (slice: HistorySlice | null) => void;
  }> = {},
) {
  act(() => {
    root.render(
      <CompareGraphPopover
        repoPath={props.repoPath ?? "/repos/demo"}
        sourceBase={props.sourceBase ?? "main"}
        sourceHead={props.sourceHead ?? "feature"}
        sourceIsLive={props.sourceIsLive ?? false}
        selectedHead={props.selectedHead}
        onSlice={props.onSlice ?? (() => {})}
      />,
    );
  });
}

function graphButton() {
  return container.querySelector(
    'button.icon-btn[aria-label="Graph"]',
  ) as HTMLButtonElement;
}

function panel() {
  return container.querySelector(
    "dialog.compare-graph-panel",
  ) as HTMLDialogElement | null;
}

function host() {
  return container.querySelector(".compare-graph") as HTMLElement | null;
}

describe("CompareGraphPopover", () => {
  test("opens with show(), not showModal()", () => {
    renderPopover();
    act(() => {
      graphButton().click();
    });
    const dialog = panel();
    expect(dialog).toBeTruthy();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.getAttribute("aria-modal")).toBeNull();
    expect(showModalCalls).toBe(0);
    expect(showCalls).toBeGreaterThan(0);
  });

  test("opening fetches the source branch pair and shows loading, not the schematic", () => {
    const load = mock(() => new Promise(() => {}));
    historyLaneClient.load = load;
    renderPopover({ sourceBase: "main", sourceHead: "feature" });
    act(() => {
      graphButton().click();
    });
    expect(load).toHaveBeenCalledWith("/repos/demo", "main", "feature");
    expect(panel()?.textContent).toContain("Loading history.");
    expect(panel()?.querySelector("svg")).toBeNull();
    expect(panel()?.querySelector(".compare-graph-legend")).toBeNull();
    expect(panel()?.getAttribute("aria-label")).toBe("History");
  });

  test("a failed fetch shows an error and not the schematic", async () => {
    historyLaneClient.load = () => Promise.reject(new Error("nope"));
    renderPopover();
    await act(async () => {
      graphButton().click();
    });
    expect(panel()?.textContent).toContain("Could not load history.");
    expect(panel()?.querySelector("svg")).toBeNull();
    expect(panel()?.querySelector(".history-lane")).toBeNull();
  });

  test("wires aria-haspopup and aria-controls to the dialog", () => {
    renderPopover();
    const btn = graphButton();
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.hasAttribute("aria-controls")).toBe(false);
    act(() => {
      btn.click();
    });
    const dialog = panel();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe(dialog?.id ?? "");
    expect(dialog?.id).toBeTruthy();
  });

  test("Escape closes the peek and preventDefault when it does", () => {
    renderPopover();
    const btn = graphButton();
    act(() => {
      btn.click();
    });
    flushFrames(2);
    expect(host()?.getAttribute("data-overlay-state")).toBe("open");
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(host()?.getAttribute("data-overlay-state")).toBe("closing");
    expect(panel()).toBeTruthy();
    finishClose();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  test("Escape from a typing target does not close or preventDefault", () => {
    renderPopover();
    act(() => {
      graphButton().click();
    });
    flushFrames(2);
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(panel()).toBeTruthy();
    expect(host()?.getAttribute("data-overlay-state")).toBe("open");
    input.remove();
  });

  test("outside pointerdown closes without restoring the trigger", () => {
    renderPopover();
    const btn = graphButton();
    act(() => {
      btn.click();
    });
    flushFrames(2);
    expect(panel()).toBeTruthy();
    const outside = document.createElement("button");
    outside.textContent = "file";
    document.body.appendChild(outside);
    outside.focus();
    act(() => {
      outside.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
    });
    expect(host()?.getAttribute("data-overlay-state")).toBe("closing");
    finishClose();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  test("places overlay origin from the Graph trigger", () => {
    renderPopover();
    const triggerRect = {
      x: 200,
      y: 20,
      left: 200,
      top: 20,
      width: 40,
      height: 28,
      right: 240,
      bottom: 48,
      toJSON() {},
    } as DOMRect;
    const panelRect = {
      x: 80,
      y: 56,
      left: 80,
      top: 56,
      width: 280,
      height: 300,
      right: 360,
      bottom: 356,
      toJSON() {},
    } as DOMRect;
    const proto = HTMLElement.prototype;
    const originalRect = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function getBoundingClientRect() {
      if (this.getAttribute?.("aria-label") === "Graph") {
        return triggerRect;
      }
      if (this.classList?.contains("compare-graph-panel")) {
        return panelRect;
      }
      return originalRect.call(this);
    };
    try {
      act(() => {
        graphButton().click();
      });
      const host = container.querySelector(".compare-graph") as HTMLElement;
      const surface = panel()!;
      expect(host.style.getPropertyValue("--overlay-origin-x")).toBe("220px");
      expect(host.style.getPropertyValue("--overlay-origin-y")).toBe("34px");
      expect(surface.style.getPropertyValue("--overlay-origin-x")).toBe("140px");
      expect(surface.style.getPropertyValue("--overlay-origin-y")).toBe("-22px");
    } finally {
      proto.getBoundingClientRect = originalRect;
    }
  });

  test("a loaded lane selects the range through that commit once", async () => {
    historyLaneClient.load = () => Promise.resolve(lane);
    const onSlice = mock((_slice: HistorySlice | null) => {});
    renderPopover({ sourceIsLive: true, onSlice });
    await act(async () => {
      graphButton().click();
    });
    expect(panel()?.textContent).toContain("Anchor the popover");
    const row = container.querySelector('[data-history-index="2"]');
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSlice).toHaveBeenCalledTimes(1);
    expect(onSlice).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "range",
        sourceBase: "main",
        sourceHead: "feature",
        specBase: "main",
        specHead: "mid-oid",
        detail: "Through midoid1. 1 later commit and uncommitted changes hidden.",
      }),
    );
  });

  test("This commit is the same selection event", async () => {
    historyLaneClient.load = () => Promise.resolve(lane);
    const onSlice = mock((_slice: HistorySlice | null) => {});
    renderPopover({ sourceIsLive: true, selectedHead: "mid-oid", onSlice });
    await act(async () => {
      graphButton().click();
    });
    const button = [...container.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("This commit"),
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSlice).toHaveBeenCalledTimes(1);
    expect(onSlice).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "commit",
        specBase: "base-oid",
        specHead: "mid-oid",
        sourceHead: "feature",
      }),
    );
  });
});
