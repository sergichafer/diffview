import { LogicalPosition } from "@tauri-apps/api/dpi";
import { describe, expect, test } from "bun:test";
import {
  desktopWindowChromeOptions,
  MAC_TRAFFIC_LIGHT_POSITION,
} from "./tauriEnv";

describe("desktopWindowChromeOptions", () => {
  test("darwin uses Overlay titlebar and traffic light position", () => {
    const options = desktopWindowChromeOptions("darwin");
    expect(options).toMatchObject({
      decorations: true,
      hiddenTitle: true,
      titleBarStyle: "overlay",
    });
    expect(options.trafficLightPosition).toBeInstanceOf(LogicalPosition);
    expect(options.trafficLightPosition?.x).toBe(MAC_TRAFFIC_LIGHT_POSITION.x);
    expect(options.trafficLightPosition?.y).toBe(MAC_TRAFFIC_LIGHT_POSITION.y);
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
