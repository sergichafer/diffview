import { describe, expect, test } from "bun:test";
import { truncateLabel } from "./truncateLabel";

describe("truncateLabel", () => {
  test("leaves short names unchanged", () => {
    expect(truncateLabel("main", 14)).toBe("main");
  });

  test("truncates long names with ellipsis at the given width", () => {
    expect(truncateLabel("feature/very-long-branch-name", 14)).toBe(
      "feature/very-…",
    );
    expect(truncateLabel("feature/very-long-branch-name", 16)).toBe(
      "feature/very-lo…",
    );
  });
});
