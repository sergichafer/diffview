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

const unlistenResize = mock(() => {});
const unlistenFocus = mock(() => {});
const onResized = mock((_handler: () => void) => Promise.resolve(unlistenResize));
const onFocusChanged = mock((_handler: (event: FocusPayload) => void) =>
  Promise.resolve(unlistenFocus),
);
const minimize = mock(() => Promise.resolve());
const toggleMaximize = mock(() => Promise.resolve());
const close = mock(() => Promise.resolve());
const isMaximized = mock(() => Promise.resolve(false));
const isFullscreen = mock(() => Promise.resolve(false));

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
  isMaximized.mockReset();
  isMaximized.mockImplementation(() => Promise.resolve(false));
  isFullscreen.mockReset();
  isFullscreen.mockImplementation(() => Promise.resolve(false));
  onResized.mockReset();
  onResized.mockImplementation((_handler: () => void) =>
    Promise.resolve(unlistenResize),
  );
  onFocusChanged.mockReset();
  onFocusChanged.mockImplementation((_handler: (event: FocusPayload) => void) =>
    Promise.resolve(unlistenFocus),
  );
  unlistenResize.mockClear();
  unlistenFocus.mockClear();
  minimize.mockClear();
  toggleMaximize.mockClear();
  close.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderChrome() {
  await act(async () => {
    root.render(<WindowChrome />);
  });
}

async function reportResize() {
  const handler = onResized.mock.calls[0]?.[0];
  expect(handler).toBeDefined();
  await act(async () => {
    handler?.();
  });
}

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

  test("linux chrome shows brand and Maximize", async () => {
    await renderChrome();
    expect(container.querySelector(".window-chrome-title")?.textContent).toBe(
      "Diffview",
    );
    const maximize = [...container.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-label") === "Maximize",
    );
    expect(maximize).toBeDefined();
    expect(container.querySelector(".window-chrome-mac")).toBeNull();
  });

  test("darwin chrome uses Overlay inset and draws no caption buttons", async () => {
    platform.value = "darwin";
    await renderChrome();
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

  test("darwin chrome marks fullscreen after a resize reports fullscreen", async () => {
    platform.value = "darwin";
    await renderChrome();
    expect(container.querySelector(".window-chrome-fullscreen")).toBeNull();
    expect(
      container
        .querySelector(".window-chrome-mac")
        ?.getAttribute("data-tauri-drag-region"),
    ).toBe("deep");

    isFullscreen.mockImplementation(() => Promise.resolve(true));
    await reportResize();

    const header = container.querySelector(".window-chrome-mac");
    expect(header).not.toBeNull();
    expect(header?.classList.contains("window-chrome-fullscreen")).toBe(true);
    expect(header?.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  test("Maximize label becomes Restore after a resize reports maximized", async () => {
    await renderChrome();
    expect(
      [...container.querySelectorAll("button")].some(
        (el) => el.getAttribute("aria-label") === "Maximize",
      ),
    ).toBe(true);

    isMaximized.mockImplementation(() => Promise.resolve(true));
    await reportResize();

    expect(
      [...container.querySelectorAll("button")].some(
        (el) => el.getAttribute("aria-label") === "Restore",
      ),
    ).toBe(true);
  });

  test("unmount before isMaximized resolves does not throw and unlistens", async () => {
    isMaximized.mockImplementation(() => new Promise(() => {}));

    await renderChrome();
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
  });

  test("focus after unmount does not throw", async () => {
    await renderChrome();
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
