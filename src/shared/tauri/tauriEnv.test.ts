import { describe, expect, test } from "bun:test";
import {
  desktopWindowChromeOptions,
  usesNativeMacTitlebar,
} from "./tauriEnv";

describe("usesNativeMacTitlebar", () => {
  test("true only for darwin", () => {
    expect(usesNativeMacTitlebar("darwin")).toBe(true);
    expect(usesNativeMacTitlebar("linux")).toBe(false);
    expect(usesNativeMacTitlebar("windows")).toBe(false);
    expect(usesNativeMacTitlebar(null)).toBe(false);
  });
});

describe("desktopWindowChromeOptions", () => {
  test("darwin keeps AppKit traffic lights via Overlay", () => {
    expect(desktopWindowChromeOptions("darwin")).toEqual({
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "overlay",
    });
  });

  test("windows and linux use in-content caption buttons", () => {
    expect(desktopWindowChromeOptions("linux")).toEqual({
      decorations: false,
      hiddenTitle: false,
    });
    expect(desktopWindowChromeOptions("windows")).toEqual({
      decorations: false,
      hiddenTitle: false,
    });
  });
});
