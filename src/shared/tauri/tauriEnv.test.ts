import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { describe, expect, test } from "bun:test";
import {
  desktopWindowChromeOptions,
  MAC_TRAFFIC_LIGHT_INSET_PX,
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

describe("MAC_TRAFFIC_LIGHT_POSITION", () => {
  test("matches tauri.macos.conf.json and the CSS inset token", () => {
    const macos = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../../src-tauri/tauri.macos.conf.json"),
        "utf8",
      ),
    ) as {
      app: {
        windows: Array<{
          trafficLightPosition: { x: number; y: number };
        }>;
      };
    };
    const pos = macos.app.windows[0]?.trafficLightPosition;
    expect(pos).toEqual(MAC_TRAFFIC_LIGHT_POSITION);
    expect(MAC_TRAFFIC_LIGHT_INSET_PX).toBe(
      MAC_TRAFFIC_LIGHT_POSITION.x + 52 + 12,
    );

    const tokens = readFileSync(
      join(import.meta.dir, "../../design/tokens.css"),
      "utf8",
    );
    const inset = tokens.match(
      /--window-chrome-traffic-inset:\s*(\d+)px/,
    )?.[1];
    expect(Number(inset)).toBe(MAC_TRAFFIC_LIGHT_INSET_PX);
  });
});
