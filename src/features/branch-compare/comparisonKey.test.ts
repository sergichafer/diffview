import { describe, expect, test } from "bun:test";
import {
  makeComparisonKey,
  sliceComparisonKey,
  sourceKeyOfSlice,
} from "./comparisonKey";

describe("comparisonKey", () => {
  test("makeComparisonKey joins repo and branch pair", () => {
    const key = makeComparisonKey("/repos/demo", "main", "feature");
    expect(key).toBe("/repos/demo|main|feature");
  });

  test("a slice key round-trips to its source and never matches a branch key", () => {
    const source = makeComparisonKey("/repos/demo", "main", "feature");
    const slice = sliceComparisonKey(source);
    expect(sourceKeyOfSlice(slice)).toBe(source);
    expect(slice).not.toBe(source);
    expect(sourceKeyOfSlice(source)).toBeNull();
    expect(slice.includes("|")).toBe(false);
  });

  test("a repo path that starts with slice: stays a branch key", () => {
    const source = makeComparisonKey("slice:/repos/demo", "main", "feature");
    expect(sourceKeyOfSlice(source)).toBeNull();
    expect(sourceKeyOfSlice(sliceComparisonKey(source))).toBe(source);
  });
});
