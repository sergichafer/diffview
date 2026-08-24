import { describe, expect, test } from "bun:test";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import { normalizeAppSettings } from "./settings";
import { DEFAULT_SETTINGS } from "@/shared/types/app";

describe("normalizeAppSettings", () => {
  test("fills defaults when partial is null", () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.workspacesWidth).toBe(240);
  });

  test("preserves valid activePathByRepo entries", () => {
    const settings = normalizeAppSettings({
      activePathByRepo: { "/repo": "src/b.ts" },
    });
    expect(settings.activePathByRepo).toEqual({ "/repo": "src/b.ts" });
  });

  test("coerces corrupt activePathByRepo to empty map", () => {
    const settings = normalizeAppSettings({
      // @ts-expect-error intentional corrupt payload
      activePathByRepo: "nope",
    });
    expect(settings.activePathByRepo).toEqual({});
  });

  test("migrates activePathByRepo to activePathByComparison", () => {
    const settings = normalizeAppSettings({
      activePathByRepo: { "/repo": "src/a.ts" },
      baseBranchByRepo: { "/repo": "main" },
      headBranchByRepo: { "/repo": "feature" },
    });
    const key = makeComparisonKey("/repo", "main", "feature");
    expect(settings.activePathByComparison).toEqual({ [key]: "src/a.ts" });
  });

  test("coerces workspaceTree and workspacesWidth", () => {
    const settings = normalizeAppSettings({
      workspacesWidth: 999,
      workspaceTree: {
        workspaces: [{ repoPath: "/r", collapsed: true, comparisons: [] }],
        columnCollapsed: true,
      },
    });
    expect(settings.workspacesWidth).toBe(360);
    expect(settings.workspaceTree.columnCollapsed).toBe(true);
    expect(settings.workspaceTree.workspaces[0]?.repoPath).toBe("/r");
  });

  test("keeps a known themeId", () => {
    expect(normalizeAppSettings({ themeId: "ayu" }).themeId).toBe("ayu");
    expect(normalizeAppSettings({ themeId: "catppuccin" }).themeId).toBe(
      "catppuccin",
    );
  });

  test("unknown or empty themeId becomes harmony", () => {
    expect(
      normalizeAppSettings({
        // @ts-expect-error unknown store themeId
        themeId: "not-a-theme",
      }).themeId,
    ).toBe("harmony");
    expect(
      normalizeAppSettings({
        // @ts-expect-error empty store themeId
        themeId: "",
      }).themeId,
    ).toBe("harmony");
  });
});
