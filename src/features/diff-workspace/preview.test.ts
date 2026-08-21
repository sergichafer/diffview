import { beforeEach, describe, expect, mock, test } from "bun:test";

const chromeOptions = {
  decorations: true,
  hiddenTitle: true,
  titleBarStyle: "overlay" as const,
};

mock.module("@/shared/tauri/tauriEnv", () => ({
  desktopWindowChromeOptions: () => chromeOptions,
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
});

describe("openPreviewWindow", () => {
  test("spreads desktop window chrome onto the preview window", async () => {
    await openPreviewWindow("/repos/demo", "README.md");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.label).toBe("preview");
    expect(creates[0]?.options).toMatchObject({
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "overlay",
      dragDropEnabled: false,
    });
  });
});
