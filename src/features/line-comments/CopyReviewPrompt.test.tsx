import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CopyReviewPrompt } = await import("./CopyReviewPrompt");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const pendingHold: Array<() => void> = [];
let originalSetTimeout: typeof setTimeout;
let originalClearTimeout: typeof clearTimeout;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pendingHold.length = 0;
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number) => {
    if (typeof fn === "function" && ms === 1400) {
      pendingHold.push(fn as () => void);
      return 99 as unknown as number;
    }
    return originalSetTimeout(fn as never, ms as never);
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    if (id === 99) {
      pendingHold.length = 0;
      return;
    }
    originalClearTimeout(id);
  }) as typeof clearTimeout;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
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
    expect(btn?.getAttribute("aria-label")).toBe("Copy review prompt");
    expect(btn?.textContent).toContain("Copy review prompt");

    await act(async () => {
      (btn as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("hello prompt");
    expect(btn?.classList.contains("is-copied")).toBe(true);
    expect(btn?.getAttribute("aria-label")).toBe("Copied");

    act(() => {
      pendingHold.shift()?.();
    });
    expect(btn?.classList.contains("is-copied")).toBe(false);
    expect(btn?.getAttribute("aria-label")).toBe("Copy review prompt");
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
    await act(async () => {
      (btn as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(btn?.classList.contains("is-copied")).toBe(false);
    expect(btn?.getAttribute("aria-label")).toBe("Copy review prompt");
  });
});
