import { describe, expect, test } from "bun:test";
import { makeComparisonKey } from "./comparisonKey";

describe("comparisonKey", () => {
  test("makeComparisonKey joins repo and branch pair", () => {
    const key = makeComparisonKey("/repos/demo", "main", "feature");
    expect(key).toBe("/repos/demo|main|feature");
  });
});
