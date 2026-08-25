import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { CopyReviewPrompt, HOLD_COPIED_MS } from "./CopyReviewPrompt";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const pendingHold: Array<() => void> = [];
let originalSetTimeout: typeof window.setTimeout;
let originalClearTimeout: typeof window.clearTimeout;
let holdTimer: ReturnType<typeof window.setTimeout> | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pendingHold.length = 0;
  holdTimer = undefined;
  originalSetTimeout = window.setTimeout.bind(window);
  originalClearTimeout = window.clearTimeout.bind(window);
  window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    if (typeof handler === "function" && timeout === HOLD_COPIED_MS) {
      pendingHold.push(handler);
      holdTimer = originalSetTimeout(() => {}, 60_000);
      return holdTimer;
    }
    return originalSetTimeout(handler, timeout);
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: ReturnType<typeof window.setTimeout>) => {
    if (holdTimer !== undefined && id === holdTimer) {
      originalClearTimeout(holdTimer);
      holdTimer = undefined;
      pendingHold.length = 0;
      return;
    }
    originalClearTimeout(id);
  }) as typeof window.clearTimeout;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (holdTimer !== undefined) originalClearTimeout(holdTimer);
  window.setTimeout = originalSetTimeout;
  window.clearTimeout = originalClearTimeout;
});

describe("CopyReviewPrompt", () => {
  test("copies the prompt and shows Copied after a successful write", async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    act(() => {
      root.render(<CopyReviewPrompt prompt="hello prompt" />);
    });
    const btn = container.querySelector("button.copy-review-prompt");
    if (!(btn instanceof HTMLButtonElement)) {
      throw new Error("expected copy button");
    }
    expect(btn.getAttribute("aria-label")).toBe("Copy review prompt");
    expect(btn.textContent).toContain("Copy review prompt");

    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("hello prompt");
    expect(btn.classList.contains("is-copied")).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("Copied");

    act(() => {
      pendingHold.shift()?.();
    });
    expect(btn.classList.contains("is-copied")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("Copy review prompt");
  });

  test("stays on the resting label when the clipboard write fails", async () => {
    const writeText = mock(() => Promise.reject(new Error("denied")));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    act(() => {
      root.render(<CopyReviewPrompt prompt="hello" />);
    });
    const btn = container.querySelector("button.copy-review-prompt");
    if (!(btn instanceof HTMLButtonElement)) {
      throw new Error("expected copy button");
    }
    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(btn.classList.contains("is-copied")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("Copy review prompt");
  });
});
