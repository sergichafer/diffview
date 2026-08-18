import { describe, expect, test } from "bun:test";
import { applyBranchPick, branchOptionNames } from "./branchCompare";

describe("branchOptionNames", () => {
  test("is the repo list only; selection cannot shrink it", () => {
    const branches = ["feature/alpha", "main"];
    const options = branchOptionNames(branches);
    expect(options).toEqual(["feature/alpha", "main"]);
    // Collapsed selection is irrelevant; options stay the repo list.
    expect(branchOptionNames(branches)).toEqual(options);
    expect(options).toContain("main");
    expect(options).toContain("feature/alpha");
  });

  test("empty repo list stays empty (no placeholder names)", () => {
    expect(branchOptionNames([])).toEqual([]);
  });
});

describe("applyBranchPick", () => {
  test("sets head without touching base", () => {
    expect(
      applyBranchPick("head", "feature", { head: "HEAD", base: "main" }),
    ).toEqual({ head: "feature", base: "main" });
  });

  test("sets base without touching head", () => {
    expect(
      applyBranchPick("base", "develop", { head: "feature", base: "main" }),
    ).toEqual({ head: "feature", base: "develop" });
  });

  test("picking the other slot's branch swaps instead of collapsing", () => {
    expect(
      applyBranchPick("head", "main", { head: "feature", base: "main" }),
    ).toEqual({ head: "main", base: "feature" });
    expect(
      applyBranchPick("base", "feature", { head: "feature", base: "main" }),
    ).toEqual({ head: "main", base: "feature" });
  });

  test("picking the active slot's current value is a no-op", () => {
    expect(
      applyBranchPick("head", "feature", { head: "feature", base: "main" }),
    ).toEqual({ head: "feature", base: "main" });
    expect(
      applyBranchPick("base", "main", { head: "feature", base: "main" }),
    ).toEqual({ head: "feature", base: "main" });
  });

  test("never yields head === base when names differ", () => {
    const start = { head: "feature/alpha", base: "main" };
    for (const slot of ["head", "base"] as const) {
      for (const name of ["feature/alpha", "main", "develop"]) {
        const next = applyBranchPick(slot, name, start);
        if (name === "develop") {
          expect(next.head).not.toBe(next.base);
        } else {
          expect(next.head).not.toBe(next.base);
        }
      }
    }
  });
});
