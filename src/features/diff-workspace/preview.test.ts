import { LogicalPosition } from "@tauri-apps/api/dpi";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as tauriEnvActual from "@/shared/tauri/tauriEnv";

const platform = { value: "linux" as string | null };

mock.module("@/shared/tauri/tauriEnv", () => ({
  ...tauriEnvActual,
  isTauriApp: () => true,
  tauriPlatform: () => platform.value,
}));

type CreateCall = { label: string; options: Record<string, unknown> };
const creates: CreateCall[] = [];

class WebviewWindow {
  static getByLabel(_label: string) {
    return Promise.resolve(null);
  }
  constructor(label: string, options: Record<string, unknown>) {
    creates.push({ label, options });
  }
  close() {
    return Promise.resolve();
  }
}

mock.module("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow,
}));

const { openPreviewWindow } = await import("./preview");

beforeEach(() => {
  creates.length = 0;
  platform.value = "linux";
});

describe("openPreviewWindow", () => {
  test("linux preview is frameless with in-content chrome", async () => {
    await openPreviewWindow("/repos/demo", "README.md");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.label).toBe("preview");
    expect(creates[0]?.options).toMatchObject({
      title: "Preview: README.md",
      decorations: false,
      hiddenTitle: false,
      dragDropEnabled: false,
    });
    expect(creates[0]?.options.titleBarStyle).toBeUndefined();
    expect(creates[0]?.options.trafficLightPosition).toBeUndefined();
  });

  test("darwin preview uses Overlay traffic lights", async () => {
    platform.value = "darwin";
    await openPreviewWindow("/repos/demo", "README.md");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.options).toMatchObject({
      title: "Preview: README.md",
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "overlay",
      dragDropEnabled: false,
    });
    expect(creates[0]?.options.trafficLightPosition).toBeInstanceOf(
      LogicalPosition,
    );
    expect(creates[0]?.options.trafficLightPosition).toMatchObject({
      x: 16,
      y: 8,
    });
  });
});
