import { describe, expect, test } from "bun:test";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import {
  migrateActivePathByComparison,
  normalizeActivePathByRepo,
} from "./settings";

describe("normalizeActivePathByRepo", () => {
  test("returns empty object for non-objects", () => {
    expect(normalizeActivePathByRepo(null)).toEqual({});
    expect(normalizeActivePathByRepo(undefined)).toEqual({});
    expect(normalizeActivePathByRepo("x")).toEqual({});
    expect(normalizeActivePathByRepo([])).toEqual({});
  });

  test("keeps non-empty string entries", () => {
    expect(
      normalizeActivePathByRepo({
        "/repo/a": "src/a.ts",
        "/repo/b": "b.ts",
      }),
    ).toEqual({
      "/repo/a": "src/a.ts",
      "/repo/b": "b.ts",
    });
  });

  test("drops empty keys/values and non-strings", () => {
    expect(
      normalizeActivePathByRepo({
        "/repo/a": "ok.ts",
        "": "gone.ts",
        "/repo/b": "",
        "/repo/c": 12,
        "/repo/d": null,
      }),
    ).toEqual({ "/repo/a": "ok.ts" });
  });
});

describe("migrateActivePathByComparison", () => {
  test("prefers explicit comparison map", () => {
    const key = makeComparisonKey("/repo", "main", "feature");
    expect(
      migrateActivePathByComparison(
        { [key]: "a.ts" },
        { "/repo": "legacy.ts" },
        { "/repo": "main" },
        { "/repo": "feature" },
      ),
    ).toEqual({ [key]: "a.ts" });
  });

  test("migrates legacy repo entries when base/head exist", () => {
    const key = makeComparisonKey("/repo", "main", "feature");
    expect(
      migrateActivePathByComparison(
        {},
        { "/repo": "a.ts", "/other": "b.ts" },
        { "/repo": "main" },
        { "/repo": "feature" },
      ),
    ).toEqual({ [key]: "a.ts" });
  });

  test("drops unpaired legacy entries", () => {
    expect(
      migrateActivePathByComparison(
        {},
        { "/repo": "a.ts" },
        {},
        {},
      ),
    ).toEqual({});
  });
});
