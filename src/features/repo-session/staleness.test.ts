import { describe, expect, test } from "bun:test";
import {
  decideAfterStamp,
  decideBeforeStamp,
  type StalenessInput,
} from "./staleness";
import type { Residency } from "./types";

function input(
  overrides: Partial<StalenessInput> & { residency: Residency },
): StalenessInput {
  return {
    isLive: false,
    outdated: false,
    hasFileDiffs: false,
    isActive: false,
    ...overrides,
  };
}

describe("decideBeforeStamp", () => {
  test("isLive → load", () => {
    expect(decideBeforeStamp(input({ residency: "cold", isLive: true }))).toBe(
      "load",
    );
  });

  test("outdated → load", () => {
    expect(
      decideBeforeStamp(input({ residency: "hot", outdated: true, hasFileDiffs: true })),
    ).toBe("load");
  });

  test("isLive+outdated → load", () => {
    expect(
      decideBeforeStamp(input({ residency: "warm", isLive: true, outdated: true })),
    ).toBe("load");
  });

  test("hot + hasFileDiffs → skip", () => {
    expect(
      decideBeforeStamp(input({ residency: "hot", hasFileDiffs: true })),
    ).toBe("skip");
  });

  test("hot without fileDiffs → check-stamp", () => {
    expect(
      decideBeforeStamp(input({ residency: "hot", hasFileDiffs: false })),
    ).toBe("check-stamp");
  });

  test("warm → check-stamp", () => {
    expect(decideBeforeStamp(input({ residency: "warm" }))).toBe("check-stamp");
  });

  test("cold → check-stamp", () => {
    expect(decideBeforeStamp(input({ residency: "cold" }))).toBe("check-stamp");
  });

  test("warm + hasFileDiffs → check-stamp (not skip)", () => {
    expect(
      decideBeforeStamp(input({ residency: "warm", hasFileDiffs: true })),
    ).toBe("check-stamp");
  });
});

describe("decideAfterStamp", () => {
  // stampsMatch && residency !== "cold" && !outdated
  test("warm + match → load regardless of isActive", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "warm", isActive: false }),
        stampsMatch: true,
      }),
    ).toBe("load");
    expect(
      decideAfterStamp({
        ...input({ residency: "warm", isActive: true }),
        stampsMatch: true,
      }),
    ).toBe("load");
  });

  test("hot + match + !outdated + active → load", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "hot", isActive: true }),
        stampsMatch: true,
      }),
    ).toBe("load");
  });

  test("hot + match + !outdated + inactive → skip", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "hot", isActive: false }),
        stampsMatch: true,
      }),
    ).toBe("skip");
  });

  // stampsMatch && residency === "hot" (reachable for hot+outdated+match)
  test("hot + outdated + match → skip", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "hot", outdated: true, isActive: true }),
        stampsMatch: true,
      }),
    ).toBe("skip");
  });

  // !stampsMatch
  test("mismatch → mark-outdated-load (any residency)", () => {
    for (const residency of ["cold", "warm", "hot"] as const) {
      expect(
        decideAfterStamp({
          ...input({ residency, outdated: true }),
          stampsMatch: false,
        }),
      ).toBe("mark-outdated-load");
      expect(
        decideAfterStamp({
          ...input({ residency }),
          stampsMatch: false,
        }),
      ).toBe("mark-outdated-load");
    }
  });

  // otherwise → load (cold+match, warm+outdated+match)
  test("cold + match → load", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "cold", isActive: false }),
        stampsMatch: true,
      }),
    ).toBe("load");
    expect(
      decideAfterStamp({
        ...input({ residency: "cold", isActive: true }),
        stampsMatch: true,
      }),
    ).toBe("load");
  });

  test("warm + outdated + match → load", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "warm", outdated: true }),
        stampsMatch: true,
      }),
    ).toBe("load");
  });

  test("cold + outdated + match → load", () => {
    expect(
      decideAfterStamp({
        ...input({ residency: "cold", outdated: true }),
        stampsMatch: true,
      }),
    ).toBe("load");
  });
});
