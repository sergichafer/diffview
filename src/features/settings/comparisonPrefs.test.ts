import { describe, expect, test } from "bun:test";
import {
  resolveComparisonPrefs,
  shouldLoadOverview,
} from "./comparisonPrefs";
import { DEFAULT_SETTINGS, type AppSettings, type RepoInfo } from "@/shared/types/app";

const repo: RepoInfo = {
  path: "/repos/demo",
  name: "demo",
  headBranch: "feature",
  defaultBase: "main",
};

const branches = ["main", "develop", "feature"];

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe("resolveComparisonPrefs", () => {
  test("falls back to repo defaults when no prefs", () => {
    expect(resolveComparisonPrefs(settings(), repo, branches)).toEqual({
      base: "main",
      head: "feature",
    });
  });

  test("uses saved base/head when present in branches", () => {
    const prefs = settings({
      baseBranchByRepo: { "/repos/demo": "develop" },
      headBranchByRepo: { "/repos/demo": "feature" },
    });
    expect(resolveComparisonPrefs(prefs, repo, branches)).toEqual({
      base: "develop",
      head: "feature",
    });
  });

  test("falls back when saved base is missing from branches", () => {
    const prefs = settings({
      baseBranchByRepo: { "/repos/demo": "gone" },
    });
    expect(resolveComparisonPrefs(prefs, repo, branches).base).toBe("main");
  });

  test("falls back when saved head is missing from branches", () => {
    const prefs = settings({
      headBranchByRepo: { "/repos/demo": "gone" },
    });
    expect(resolveComparisonPrefs(prefs, repo, branches).head).toBe("feature");
  });

  test("empty branch list keeps RepoInfo labels for live working-tree mode", () => {
    const unborn: RepoInfo = {
      ...repo,
      headBranch: "HEAD",
      defaultBase: "main",
    };
    expect(resolveComparisonPrefs(settings(), unborn, [])).toEqual({
      base: "main",
      head: "HEAD",
    });
  });

  test("clamps stale repo defaults to names present in the list", () => {
    const unbornDefaults: RepoInfo = {
      ...repo,
      headBranch: "HEAD",
      defaultBase: "main",
    };
    expect(
      resolveComparisonPrefs(settings(), unbornDefaults, ["main", "feature"]),
    ).toEqual({
      base: "main",
      head: "feature",
    });
    expect(
      resolveComparisonPrefs(settings(), unbornDefaults, ["main"]),
    ).toEqual({
      base: "main",
      head: "main",
    });
  });
});

describe("shouldLoadOverview", () => {
  test("loads for any open repo, including empty comparison labels", () => {
    expect(shouldLoadOverview("/repos/demo")).toBe(true);
    expect(shouldLoadOverview(null)).toBe(false);
    expect(shouldLoadOverview("")).toBe(false);
  });
});
