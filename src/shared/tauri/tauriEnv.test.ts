import { describe, expect, test } from "bun:test";
import { normalizeTauriPlatform } from "./tauriEnv";

describe("normalizeTauriPlatform", () => {
  test("maps darwin to macos", () => {
    expect(normalizeTauriPlatform("darwin")).toBe("macos");
  });

  test("maps androideabi to android", () => {
    expect(normalizeTauriPlatform("androideabi")).toBe("android");
  });

  test("passes linux, windows, macos, ios, android through", () => {
    for (const platform of ["linux", "windows", "macos", "ios", "android"]) {
      expect(normalizeTauriPlatform(platform)).toBe(platform);
    }
  });

  test("null, undefined, and empty become null", () => {
    expect(normalizeTauriPlatform(null)).toBeNull();
    expect(normalizeTauriPlatform(undefined)).toBeNull();
    expect(normalizeTauriPlatform("")).toBeNull();
  });
});
