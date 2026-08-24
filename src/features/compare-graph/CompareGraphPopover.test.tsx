import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CompareGraphPopover } = await import("./CompareGraphPopover");
import type { BranchMetadata, BranchOverview } from "@/shared/types/app";

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

const overview = (
  overrides: Partial<BranchOverview> = {},
): BranchOverview =>
  ({
    repoPath: "/repos/demo",
    currentBranch: "feature",
    baseBranch: "main",
    mergeBase: "mb",
    headOid: "hd",
    isLive: false,
    files: [],
    ...overrides,
  }) as BranchOverview;

const row = (name: string, ahead: number, behind: number): BranchMetadata => ({
  name,
  ahead,
  behind,
  lastSubject: "",
  author: "",
  authorInitials: "",
  lastCommitTime: 0,
  isDefault: false,
  isCurrent: name === "feature",
});

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
  if (DialogProto) {
    DialogProto.show = originalShow;
    DialogProto.showModal = originalShowModal;
  }
});

function renderPopover(
  props: Partial<{
    head: string;
    base: string;
    overview: BranchOverview | null;
    metadata: BranchMetadata[];
    onNeedMetadata: () => void;
  }> = {},
) {
  act(() => {
    root.render(
      <CompareGraphPopover
        head={props.head ?? "feature"}
        base={props.base ?? "main"}
        overview={props.overview === undefined ? overview() : props.overview}
        metadata={props.metadata ?? []}
        onNeedMetadata={props.onNeedMetadata}
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
    const onNeedMetadata = mock(() => {});
    renderPopover({ onNeedMetadata });
    act(() => {
      graphButton().click();
    });
    const dialog = panel();
    expect(dialog).toBeTruthy();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.getAttribute("aria-modal")).toBeNull();
    expect(showModalCalls).toBe(0);
    expect(showCalls).toBeGreaterThan(0);
    expect(onNeedMetadata).toHaveBeenCalled();
  });

  test("unknown caption when counts have not loaded", () => {
    renderPopover({ metadata: [] });
    act(() => {
      graphButton().click();
    });
    expect(panel()?.textContent).toContain("Graph. Waiting for branch counts.");
    expect(panel()?.textContent).not.toContain("In sync");
  });

  test("sync caption when head metadata is 0/0", () => {
    renderPopover({
      metadata: [row("feature", 0, 0)],
    });
    act(() => {
      graphButton().click();
    });
    expect(panel()?.textContent).toContain("In sync. 0 ahead, 0 behind.");
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

  test("live comparison legends WIP, not Working tree", () => {
    renderPopover({
      overview: overview({ isLive: true }),
    });
    act(() => {
      graphButton().click();
    });
    const legend = panel()?.querySelector(".compare-graph-legend")?.textContent;
    expect(legend).toContain("WIP");
    expect(legend).not.toContain("Working tree");
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
});
