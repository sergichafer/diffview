import { describe, expect, test } from "bun:test";
import { buildDiffLayoutUnsafeCss } from "./diff-layout-unsafe-css";
import { getThemeDefinition } from "../registry";

describe("buildDiffLayoutUnsafeCss", () => {
  test("paints comment lines with the info mix color", () => {
    const roles = getThemeDefinition("harmony", "dark").roles;
    const css = buildDiffLayoutUnsafeCss(roles);
    expect(css).toContain("[data-comment-line]:not([data-selected-line])");
    expect(css).toContain(roles.states.info);
    expect(css).toContain("--diffs-computed-selected-line-bg");
  });
});
