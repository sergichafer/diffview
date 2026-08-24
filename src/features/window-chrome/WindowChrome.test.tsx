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

  test("darwin chrome draws no caption buttons and queries fullscreen", async () => {
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

  test("darwin chrome drops the drag region after a resize reports fullscreen", async () => {
    platform.value = "darwin";
    await renderChrome();
    expect(
      container
        .querySelector(".window-chrome-mac")
        ?.getAttribute("data-tauri-drag-region"),
    ).toBe("deep");

    isFullscreen.mockImplementation(() => Promise.resolve(true));
    await reportResize();

    const header = container.querySelector(".window-chrome-mac");
    expect(header).not.toBeNull();
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
    let resolveMaximized = (_value: boolean) => {};
    isMaximized.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveMaximized = resolve;
        }),
    );

    await renderChrome();
    expect(onResized).toHaveBeenCalled();
    expect(onFocusChanged).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });

    await act(async () => {
      resolveMaximized(true);
    });
    expect(unlistenResize).toHaveBeenCalled();
    expect(unlistenFocus).toHaveBeenCalled();
    expect(container.querySelector(".window-chrome")).toBeNull();
  });

  test("unmount before isFullscreen resolves does not restore the drag region", async () => {
    platform.value = "darwin";
    let resolveFullscreen = (_value: boolean) => {};
    isFullscreen.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFullscreen = resolve;
        }),
    );

    await renderChrome();
    expect(
      container
        .querySelector(".window-chrome-mac")
        ?.getAttribute("data-tauri-drag-region"),
    ).toBe("deep");

    act(() => {
      root.unmount();
    });

    await act(async () => {
      resolveFullscreen(true);
    });
    expect(container.querySelector(".window-chrome")).toBeNull();
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
