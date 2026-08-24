import { describe, expect, test } from "bun:test";
import { restingLabel } from "./restingLabel";

describe("restingLabel", () => {
  test("review copy is stable", () => {
    expect(restingLabel("review", 2)).toBe("Copy review");
  });

  test("count copy is singular and plural", () => {
    expect(restingLabel("count", 1)).toBe("Copy 1 comment");
    expect(restingLabel("count", 2)).toBe("Copy 2 comments");
  });

  test("ai copy is stable", () => {
    expect(restingLabel("ai", 4)).toBe("Copy for AI");
  });
});
