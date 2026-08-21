import { Window } from "happy-dom";

const dom = new Window();
for (const key of [
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as tauriEnvActual from "@/shared/tauri/tauriEnv";

const chromeEnabled = { value: true };
const platform = { value: "linux" as string | null };

mock.module("@/shared/tauri/tauriEnv", () => ({
  ...tauriEnvActual,
  isTauriApp: () => true,
  tauriPlatform: () => platform.value,
  useCustomWindowChrome: () => chromeEnabled.value,
}));

type FocusPayload = { payload: boolean };

function pendingFlag() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let maximized = pendingFlag();
let fullscreen = pendingFlag();

const unlistenResize = mock(() => {});
const unlistenFocus = mock(() => {});
const onResized = mock((_handler: () => void) => Promise.resolve(unlistenResize));
const onFocusChanged = mock((_handler: (event: FocusPayload) => void) =>
  Promise.resolve(unlistenFocus),
);
const minimize = mock(() => Promise.resolve());
const toggleMaximize = mock(() => Promise.resolve());
const close = mock(() => Promise.resolve());
const isMaximized = mock(() => maximized.promise);
const isFullscreen = mock(() => fullscreen.promise);

class WebviewWindow {
  static getByLabel(_label: string) {
    return Promise.resolve(null);
  }
  constructor(..._args: unknown[]) {}
  close() {
    return Promise.resolve();
  }
}

mock.module("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow,
  getCurrentWebviewWindow: () => ({
    isMaximized,
    onResized,
    onFocusChanged,
    minimize,
    toggleMaximize,
    close,
    isFullscreen,
  }),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { WindowChrome } = await import("./WindowChrome");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  chromeEnabled.value = true;
  platform.value = "linux";
  maximized = pendingFlag();
  fullscreen = pendingFlag();
  for (const m of [
    isMaximized,
    isFullscreen,
    onResized,
    onFocusChanged,
    unlistenResize,
    unlistenFocus,
    minimize,
    toggleMaximize,
    close,
  ]) {
    m.mockClear();
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WindowChrome", () => {
  test("enabled=false renders null and does not subscribe", () => {
    chromeEnabled.value = false;
    act(() => {
      root.render(<WindowChrome />);
    });
    expect(container.querySelector(".window-chrome")).toBeNull();
    expect(container.textContent).toBe("");
    expect(onResized).not.toHaveBeenCalled();
    expect(onFocusChanged).not.toHaveBeenCalled();
  });

  test("linux chrome shows brand and Maximize", () => {
    act(() => {
      root.render(<WindowChrome />);
    });
    expect(container.querySelector(".window-chrome-title")?.textContent).toBe(
      "Diffview",
    );
    const maximize = [...container.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-label") === "Maximize",
    );
    expect(maximize).toBeDefined();
    expect(container.querySelector(".window-chrome-mac")).toBeNull();
  });

  test("darwin chrome uses Overlay inset and draws no caption buttons", () => {
    platform.value = "darwin";
    act(() => {
      root.render(<WindowChrome />);
    });
    const header = container.querySelector(".window-chrome-mac");
    expect(header).not.toBeNull();
    expect(header?.getAttribute("data-tauri-drag-region")).toBe("deep");
    expect(container.querySelector(".window-chrome-title")?.textContent).toBe(
      "Diffview",
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(isFullscreen).toHaveBeenCalled();
    expect(isMaximized).not.toHaveBeenCalled();
  });

  test("darwin chrome marks fullscreen after isFullscreen resolves true", async () => {
    platform.value = "darwin";
    act(() => {
      root.render(<WindowChrome />);
    });
    expect(container.querySelector(".window-chrome-fullscreen")).toBeNull();
    expect(
      container
        .querySelector(".window-chrome-mac")
        ?.getAttribute("data-tauri-drag-region"),
    ).toBe("deep");

    await act(async () => {
      fullscreen.resolve(true);
      await fullscreen.promise;
    });

    const header = container.querySelector(".window-chrome-mac");
    expect(header).not.toBeNull();
    expect(header?.classList.contains("window-chrome-fullscreen")).toBe(true);
    expect(header?.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  test("Maximize label becomes Restore after isMaximized resolves true", async () => {
    act(() => {
      root.render(<WindowChrome />);
    });
    expect(
      [...container.querySelectorAll("button")].some(
        (el) => el.getAttribute("aria-label") === "Maximize",
      ),
    ).toBe(true);

    await act(async () => {
      maximized.resolve(true);
      await maximized.promise;
    });

    expect(
      [...container.querySelectorAll("button")].some(
        (el) => el.getAttribute("aria-label") === "Restore",
      ),
    ).toBe(true);
  });

  test("unmount before isMaximized resolves does not throw and unlistens", async () => {
    act(() => {
      root.render(<WindowChrome />);
    });
    expect(onResized).toHaveBeenCalled();
    expect(onFocusChanged).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(unlistenResize).toHaveBeenCalled();
    expect(unlistenFocus).toHaveBeenCalled();

    await act(async () => {
      maximized.resolve(true);
      await maximized.promise;
    });
  });

  test("focus after unmount does not throw", async () => {
    act(() => {
      root.render(<WindowChrome />);
    });
    const handler = onFocusChanged.mock.calls[0]?.[0];
    expect(handler).toBeDefined();

    act(() => {
      root.unmount();
    });

    await act(async () => {
      handler?.({ payload: false });
    });
  });
});
