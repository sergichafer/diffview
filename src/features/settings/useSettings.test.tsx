import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppSettings } from "@/shared/types/app";
import * as settingsActual from "./settings";

const saveSettings = mock((_s: AppSettings) => Promise.resolve());
mock.module("./settings", () => ({
  ...settingsActual,
  saveSettings: (s: AppSettings) => saveSettings(s),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useSettings } = await import("./useSettings");
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");

type HookApi = ReturnType<typeof useSettings>;

function mountHook(initial: AppSettings = DEFAULT_SETTINGS): {
  get: () => HookApi;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: HookApi | null = null;

  function Harness() {
    latest = useSettings(initial);
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useSettings", () => {
  beforeEach(() => {
    saveSettings.mockReset();
    saveSettings.mockImplementation(() => Promise.resolve());
  });

  test("does not persist on mount", () => {
    const h = mountHook();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(h.get().settings).toBe(DEFAULT_SETTINGS);
    h.unmount();
  });

  test("single patch merges and persists", () => {
    const h = mountHook();
    act(() => {
      void h.get().update({ diffStyle: "unified" });
    });
    expect(h.get().settings.diffStyle).toBe("unified");
    expect(h.get().settings.themeId).toBe(DEFAULT_SETTINGS.themeId);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    const saved = saveSettings.mock.calls[0]?.[0];
    expect(saved?.diffStyle).toBe("unified");
    expect(saved?.themeId).toBe(DEFAULT_SETTINGS.themeId);
    h.unmount();
  });

  test("overlapping patches in one act compose", () => {
    const h = mountHook();
    act(() => {
      void h.get().update({ diffStyle: "unified" });
      void h.get().update({ themeMode: "light" });
    });
    expect(h.get().settings.diffStyle).toBe("unified");
    expect(h.get().settings.themeMode).toBe("light");
    expect(saveSettings).toHaveBeenCalledTimes(1);
    const saved = saveSettings.mock.calls.at(-1)?.[0];
    expect(saved?.diffStyle).toBe("unified");
    expect(saved?.themeMode).toBe("light");
    h.unmount();
  });

  test("await update() resolves without waiting for disk", async () => {
    saveSettings.mockImplementation(() => new Promise(() => {}));
    const h = mountHook();
    let resolved = false;
    await act(async () => {
      await h.get().update({ diffStyle: "unified" });
      resolved = true;
    });
    expect(resolved).toBe(true);
    expect(h.get().settings.diffStyle).toBe("unified");
    expect(saveSettings).toHaveBeenCalledTimes(1);
    h.unmount();
  });
});
