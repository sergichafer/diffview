import { describe, expect, test } from "bun:test";
import { truncateBranchLabel } from "./branchLabel";

describe("truncateBranchLabel", () => {
  test("leaves short names unchanged", () => {
    expect(truncateBranchLabel("main")).toBe("main");
  });

  test("truncates long names with ellipsis", () => {
    expect(truncateBranchLabel("feature/very-long-branch-name")).toBe(
      "feature/very-…",
    );
  });
});
