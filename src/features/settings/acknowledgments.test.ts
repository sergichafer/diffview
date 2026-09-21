import { describe, expect, test } from "bun:test";
import { ACKNOWLEDGMENT_GROUPS } from "./acknowledgments";

describe("ACKNOWLEDGMENT_GROUPS", () => {
  test("names the shipped stack with https project pages", () => {
    const names = ACKNOWLEDGMENT_GROUPS.flatMap((group) =>
      group.items.map((item) => item.name),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "Tauri",
        "React",
        "Pierre Diffs",
        "Pierre Trees",
        "libgit2",
        "git2",
        "Shiki",
        "Inter",
        "Ayu",
        "Catppuccin",
      ]),
    );

    for (const group of ACKNOWLEDGMENT_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.role.length).toBeGreaterThan(0);
        expect(item.license.length).toBeGreaterThan(0);
        const url = new URL(item.href);
        expect(url.protocol).toBe("https:");
      }
    }
  });
});
