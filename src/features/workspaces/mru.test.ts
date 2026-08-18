import { describe, expect, test } from "bun:test";
import { mostRecentKeyInGroup } from "./mru";

describe("mostRecentKeyInGroup", () => {
  test("empty comparisonKeys returns undefined", () => {
    expect(mostRecentKeyInGroup(["a", "b"], [])).toBeUndefined();
  });

  test("no MRU overlap falls back to the first group key", () => {
    expect(mostRecentKeyInGroup(["x", "y"], ["a", "b"])).toBe("a");
  });

  test("recency wins over workspace comparison order", () => {
    expect(mostRecentKeyInGroup(["b", "a"], ["a", "b"])).toBe("b");
  });

  test("skips MRU keys that belong to other groups", () => {
    expect(mostRecentKeyInGroup(["other", "b", "a"], ["a", "b"])).toBe("b");
  });
});
