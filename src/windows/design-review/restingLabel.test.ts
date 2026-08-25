import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RESTING_COPY,
  RESTING_COPY_IDS,
  RESTING_COPY_OPTIONS,
  restingLabel,
} from "./restingLabel";

describe("restingLabel", () => {
  test("default pick is Copy for AI", () => {
    expect(DEFAULT_RESTING_COPY).toBe("ai");
    expect(restingLabel("ai", 4)).toBe("Copy for AI");
  });

  test("catalog ids match the union", () => {
    expect(RESTING_COPY_OPTIONS.map((row) => row.id)).toEqual([
      ...RESTING_COPY_IDS,
    ]);
  });

  test("count-ai is singular and plural", () => {
    expect(restingLabel("count-ai", 1)).toBe("Copy 1 for AI");
    expect(restingLabel("count-ai", 2)).toBe("Copy 2 for AI");
  });

  test("count copy is singular and plural", () => {
    expect(restingLabel("count", 1)).toBe("Copy 1 comment");
    expect(restingLabel("count", 2)).toBe("Copy 2 comments");
  });

  test("stable labels", () => {
    expect(restingLabel("ai-prompt", 2)).toBe("Copy AI prompt");
    expect(restingLabel("prompt", 2)).toBe("Copy prompt");
    expect(restingLabel("notes", 2)).toBe("Copy notes");
    expect(restingLabel("review", 2)).toBe("Copy review");
    expect(restingLabel("copy", 2)).toBe("Copy");
  });
});
