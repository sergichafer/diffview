import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openProject } from "./openProject";

describe("openProject", () => {
  const openUrl = mock(async (_url: string) => {});
  const opened: string[] = [];
  const previousOpen = window.open;

  beforeEach(() => {
    openUrl.mockReset();
    openUrl.mockImplementation(async () => {});
    opened.length = 0;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
  });

  afterEach(() => {
    window.open = previousOpen;
  });

  test("opens https links through the system opener", async () => {
    await openProject("https://github.com/tauri-apps/tauri", openUrl);
    expect(openUrl).toHaveBeenCalledWith("https://github.com/tauri-apps/tauri");
    expect(opened).toEqual([]);
  });

  test("falls back to a new tab when the opener is unavailable", async () => {
    openUrl.mockImplementation(async () => {
      throw new Error("no desktop shell");
    });
    await openProject("https://github.com/libgit2/libgit2", openUrl);
    expect(opened).toEqual(["https://github.com/libgit2/libgit2"]);
  });

  test("ignores non-https URLs", async () => {
    await openProject("http://example.com", openUrl);
    await openProject("javascript:alert(1)", openUrl);
    await openProject("not a url", openUrl);
    expect(openUrl).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });
});
