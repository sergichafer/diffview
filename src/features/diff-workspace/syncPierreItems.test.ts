import { describe, expect, mock, test } from "bun:test";
import type { CodeViewDiffItem } from "@pierre/diffs/react";
import { syncPierreItems } from "./useDiffWorkspace";

function diffItem(
  id: string,
  opts: { collapsed?: boolean; version?: number } = {},
): CodeViewDiffItem {
  return {
    id,
    type: "diff",
    fileDiff: { cacheKey: id } as never,
    collapsed: opts.collapsed,
    version: opts.version,
  };
}

describe("syncPierreItems", () => {
  test("skips updateItem when version and collapsed match", () => {
    const updateItem = mock(() => {});
    const viewer = {
      getItem: (id: string) =>
        id === "a.ts" ? { collapsed: true, version: 1 } : null,
      updateItem,
    };
    const primed = new Set<string>();
    syncPierreItems(viewer, [diffItem("a.ts", { collapsed: true, version: 1 })], primed, null);
    expect(updateItem).not.toHaveBeenCalled();
  });

  test("calls updateItem when collapse flips", () => {
    const updateItem = mock(() => {});
    const item = diffItem("a.ts", { collapsed: true, version: 1 });
    const viewer = {
      getItem: () => ({ collapsed: false, version: 0 }),
      updateItem,
    };
    syncPierreItems(viewer, [item], new Set(), null);
    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledWith(item);
  });

  test("calls updateItem when version changes", () => {
    const updateItem = mock(() => {});
    const item = diffItem("a.ts", { collapsed: false, version: 2 });
    const viewer = {
      getItem: () => ({ collapsed: false, version: 0 }),
      updateItem,
    };
    syncPierreItems(viewer, [item], new Set(), null);
    expect(updateItem).toHaveBeenCalledWith(item);
  });

  test("primes each id once and skips already primed", () => {
    const prime = mock(() => {});
    const workerPool = {
      primeDiffHighlightCache: prime,
    };
    const primed = new Set<string>(["a.ts"]);
    const items = [
      diffItem("a.ts", { version: 0 }),
      diffItem("b.ts", { version: 0 }),
    ];
    const viewer = {
      getItem: () => ({ collapsed: false, version: 0 }),
      updateItem: mock(() => {}),
    };

    syncPierreItems(viewer, items, primed, workerPool as never);
    expect(prime).toHaveBeenCalledTimes(1);
    expect(prime).toHaveBeenCalledWith(items[1]!.fileDiff);
    expect(primed.has("a.ts")).toBe(true);
    expect(primed.has("b.ts")).toBe(true);
  });

  test("prunes primed ids that left the display list", () => {
    const primed = new Set<string>(["gone.ts", "a.ts"]);
    const viewer = {
      getItem: () => ({ collapsed: false, version: 0 }),
      updateItem: mock(() => {}),
    };
    syncPierreItems(viewer, [diffItem("a.ts", { version: 0 })], primed, null);
    expect(primed.has("gone.ts")).toBe(false);
    expect(primed.has("a.ts")).toBe(true);
  });

  test("does not prime when workerPool is null", () => {
    const primed = new Set<string>();
    const viewer = {
      getItem: () => null,
      updateItem: mock(() => {}),
    };
    syncPierreItems(viewer, [diffItem("a.ts")], primed, null);
    expect(primed.size).toBe(0);
  });
});
