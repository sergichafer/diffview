import { describe, expect, test } from "bun:test";
import { buildFixtureItems, PANEL_PATH, REVIEW_FILES } from "./fixture";

describe("buildFixtureItems", () => {
  test("parses the sample patches in tree order", () => {
    const items = buildFixtureItems({});
    expect(items.map((item) => item.id)).toEqual(
      REVIEW_FILES.map((file) => file.path),
    );
    const panel = items.find((item) => item.id === PANEL_PATH);
    expect(panel?.type).toBe("diff");
    expect(panel?.fileDiff.name).toBe(PANEL_PATH);
  });
});
