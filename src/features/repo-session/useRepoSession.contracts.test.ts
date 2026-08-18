import { describe, expect, test } from "bun:test";
import { emptyMultiSessionState } from "./types";

describe("useRepoSession contracts", () => {
  test("types.ts still exports emptyMultiSessionState", () => {
    expect(emptyMultiSessionState).toEqual({
      workspaceOrder: [],
      groups: {},
      comparisons: {},
      activeKey: null,
      columnCollapsed: false,
      mruKeys: [],
    });
  });

  test("async loaders read stateRef; render reads state", async () => {
    const src = await Bun.file(new URL("./useRepoSession.ts", import.meta.url)).text();
    expect(src).toContain("activeRowFromState(state)");
    expect(src).toContain("activeGroupFromState(state)");
    expect(src).toContain("activeKey: state.activeKey");
    expect(src).toContain("comparisons: state.comparisons");
    expect(src).toContain("columnCollapsed: state.columnCollapsed");

    expect(src).toContain("stateRef.current.comparisons");
    expect(src).toContain("lruHotKeyToDemote(stateRef.current");
    expect(src).toContain("const current = stateRef.current");

    const enforceStart = src.indexOf("const enforceHotCap");
    const enforceEnd = src.indexOf("}, []);", enforceStart);
    const enforce = src.slice(enforceStart, enforceEnd);
    expect(enforce).toContain("stateRef.current");
    expect(enforce).not.toMatch(/\bstate\.comparisons\b/);
  });
});
