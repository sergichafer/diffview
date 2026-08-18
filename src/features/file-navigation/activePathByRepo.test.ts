import { describe, expect, test } from "bun:test";
import {
  getActivePathForComparison,
  setActivePathForComparison,
} from "./activePathByRepo";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";

describe("getActivePathForComparison", () => {
  test("returns stored path or null", () => {
    const key = makeComparisonKey("/repo", "main", "feature");
    const byComparison = { [key]: "a.ts" };
    expect(getActivePathForComparison(byComparison, key)).toBe("a.ts");
    expect(getActivePathForComparison(byComparison, "missing")).toBeNull();
  });
});

describe("setActivePathForComparison", () => {
  test("sets and clears by comparison key", () => {
    const key = makeComparisonKey("/repo", "main", "feature");
    const next = setActivePathForComparison({}, key, "a.ts");
    expect(next[key]).toBe("a.ts");
    expect(setActivePathForComparison(next, key, null)).toEqual({});
  });
});
