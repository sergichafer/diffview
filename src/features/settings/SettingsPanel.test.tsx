const DialogProto = (globalThis as any).HTMLDialogElement?.prototype;
if (DialogProto) {
  if (typeof DialogProto.showModal !== "function") {
    DialogProto.showModal = function showModal() {
      this.setAttribute("open", "");
      this.open = true;
    };
  }
  if (typeof DialogProto.close !== "function") {
    DialogProto.close = function close() {
      this.removeAttribute("open");
      this.open = false;
    };
  }
}

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SettingsPanel } = await import("./SettingsPanel");
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");
const { THEME_OPTIONS } = await import("@/design/theme/registry");
import type { AppSettings } from "@/shared/types/app";

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

function navButton(label: string) {
  return [...container.querySelectorAll("nav button")].find((el) =>
    el.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;
}

function renderPanel(settings: AppSettings = DEFAULT_SETTINGS) {
  const onClose = mock(() => {});
  const onChange = mock((_patch: Partial<AppSettings>) => {});
  act(() => {
    root.render(
      <SettingsPanel
        settings={settings}
        onClose={onClose}
        onChange={onChange}
      />,
    );
  });
  flushFrames(2);
  return { onClose, onChange };
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    rafId = 0;
    rafPending.clear();
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafPending.set(id, cb);
      return id;
    };
    (globalThis as any).cancelAnimationFrame = (id: number) => {
      rafPending.delete(id);
    };
    (globalThis as any).matchMedia = () => ({
      matches: false,
      media: "",
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
      onchange: null,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    rafPending.clear();
  });

  test("opens on the Look pane", () => {
    renderPanel();
    expect(container.querySelector("#settings-pane-title")?.textContent).toBe(
      "Look",
    );
    expect(container.textContent).toContain("Appearance");
    expect(container.textContent).toContain("Theme");
    expect(container.textContent).not.toContain("The quick brown fox");
    expect(navButton("Look")?.getAttribute("aria-current")).toBe("page");
  });

  test("Type specimens call onChange with the chosen face", () => {
    const { onChange } = renderPanel();
    act(() => {
      navButton("Type")!.click();
    });
    expect(container.textContent).toContain("The quick brown fox");
    expect(container.textContent).toContain("const x = project(v);");

    const syne = [...container.querySelectorAll(".settings-specimen")].find(
      (el) => el.textContent?.includes("Syne"),
    ) as HTMLButtonElement;
    act(() => {
      syne.click();
    });
    expect(onChange).toHaveBeenCalledWith({ uiFont: "syne" });

    const jetbrains = [...container.querySelectorAll(".settings-specimen")].find(
      (el) => el.textContent?.includes("JetBrains Mono"),
    ) as HTMLButtonElement;
    act(() => {
      jetbrains.click();
    });
    expect(onChange).toHaveBeenCalledWith({ codeFont: "jetbrains-mono" });
  });

  test("appearance, theme, diff, and launch controls patch the right keys", () => {
    const { onChange } = renderPanel();

    const light = [...container.querySelectorAll(".settings-tile")].find((el) =>
      el.textContent?.includes("Light"),
    ) as HTMLButtonElement;
    act(() => {
      light.click();
    });
    expect(onChange).toHaveBeenCalledWith({ themeMode: "light" });

    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(
      THEME_OPTIONS.length,
    );
    const ayuLabel = THEME_OPTIONS.find((option) => option.value === "ayu")?.label;
    const ayu = [...container.querySelectorAll('[role="radio"]')].find(
      (el) => el.textContent === ayuLabel,
    ) as HTMLButtonElement;
    act(() => {
      ayu.click();
    });
    expect(onChange).toHaveBeenCalledWith({ themeId: "ayu" });

    act(() => {
      navButton("Review")!.click();
    });
    const unified = [...container.querySelectorAll(".settings-choice")].find(
      (el) => el.textContent?.includes("Unified"),
    ) as HTMLButtonElement;
    act(() => {
      unified.click();
    });
    expect(onChange).toHaveBeenCalledWith({ diffStyle: "unified" });

    act(() => {
      navButton("Startup")!.click();
    });
    const welcome = [...container.querySelectorAll(".settings-choice")].find(
      (el) => el.textContent?.includes("Welcome"),
    ) as HTMLButtonElement;
    act(() => {
      welcome.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      launchMode: "empty",
      launchPreferenceSet: true,
    });
  });

  test("only one nav item has aria-current=page", () => {
    renderPanel();
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    act(() => {
      navButton("Type")!.click();
    });
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Type");
    expect(navButton("Look")?.hasAttribute("aria-current")).toBe(false);
    expect(navButton("Look")?.getAttribute("aria-current")).not.toBe("false");
  });

  test("Escape cancel closes the dialog", () => {
    const { onClose } = renderPanel();
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    const WinEvent = (window as typeof window & { Event: typeof Event }).Event;
    act(() => {
      dialog.dispatchEvent(
        new WinEvent("cancel", { bubbles: true, cancelable: true }),
      );
    });
    expect(dialog.getAttribute("data-overlay-state")).toBe("closing");
    expect(onClose).not.toHaveBeenCalled();

    const modal = container.querySelector(".settings-modal") as HTMLElement;
    act(() => {
      const event = new WinEvent("transitionend", { bubbles: true });
      Object.defineProperty(event, "propertyName", { value: "opacity" });
      modal.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("transform transitionend on the modal does not call onClose", () => {
    const { onClose } = renderPanel();
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    const WinEvent = (window as typeof window & { Event: typeof Event }).Event;
    act(() => {
      dialog.dispatchEvent(
        new WinEvent("cancel", { bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();

    const modal = container.querySelector(".settings-modal") as HTMLElement;
    act(() => {
      const event = new WinEvent("transitionend", { bubbles: true });
      Object.defineProperty(event, "propertyName", { value: "transform" });
      modal.dispatchEvent(event);
    });
    expect(dialog.getAttribute("data-overlay-state")).toBe("closing");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("App still unmounts SettingsPanel via showSettings && onClose", async () => {
    const src = await Bun.file(
      new URL("../../windows/main/App.tsx", import.meta.url),
    ).text();
    expect(src).toContain("showSettings &&");
    expect(src).toMatch(
      /<SettingsPanel[\s\S]*onClose=\{\(\) => setShowSettings\(false\)\}/,
    );
  });
});
