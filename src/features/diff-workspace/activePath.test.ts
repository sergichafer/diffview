import { describe, expect, test } from "bun:test";
import { DEFAULT_CODE_VIEW_FILE_METRICS } from "@pierre/diffs";
import type { CodeView } from "@pierre/diffs";
import {
  laidOutDiffItemIds,
  resolveActiveDiffPathFromScroll,
} from "./activePath";

describe("resolveActiveDiffPathFromScroll", () => {
  test("returns the item whose band contains the headline line", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 100;
        if (id === "b.ts") return 300;
        return null;
      },
      getScrollHeight: () => 500,
    } as unknown as CodeView;

    expect(
      resolveActiveDiffPathFromScroll(viewer, ["a.ts", "b.ts"], 100 + header - 1),
    ).toBe("a.ts");
    expect(
      resolveActiveDiffPathFromScroll(viewer, ["a.ts", "b.ts"], 300 + header),
    ).toBe("b.ts");
  });

  test("returns null for empty item list", () => {
    const viewer = {
      getTopForItem: () => 0,
      getScrollHeight: () => 0,
    } as unknown as CodeView;
    expect(resolveActiveDiffPathFromScroll(viewer, [], 0)).toBeNull();
  });

  test("tracks tall items when virtual tops span large height", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const tallItemHeight = 500;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 0;
        if (id === "big.bin") return 200;
        if (id === "b.ts") return 200 + header + tallItemHeight;
        return null;
      },
      getScrollHeight: () => 2000,
    } as unknown as CodeView;

    const ids = ["a.ts", "big.bin", "b.ts"];
    const midScroll = 200 + header + tallItemHeight / 2;
    expect(resolveActiveDiffPathFromScroll(viewer, ids, midScroll)).toBe("big.bin");
  });

  test("ignores React ids that Pierre has not laid out yet", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const viewer = {
      getTopForItem: (id: string) => {
        if (id === "a.ts") return 0;
        if (id === "b.ts") return 400;
        // c.ts is in React displayItemIds but not in CodeView yet
        return undefined;
      },
      getScrollHeight: () => 800,
    } as unknown as CodeView;

    const ids = ["a.ts", "b.ts", "c.ts"];
    expect(laidOutDiffItemIds(viewer, ids)).toEqual(["a.ts", "b.ts"]);
    // Regression: previously a missing next-top for c.ts made a.ts's band
    // extend to contentEnd, so mid-scroll still reported a.ts.
    expect(resolveActiveDiffPathFromScroll(viewer, ids, 400 + header)).toBe("b.ts");
  });

  test("binary-searches a large laid-out list", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    const itemHeight = 100;
    const count = 2000;
    const ids = Array.from({ length: count }, (_, i) => `f${i}.ts`);
    const tops = new Map(ids.map((id, i) => [id, i * itemHeight]));
    const viewer = {
      getTopForItem: (id: string) => tops.get(id) ?? null,
      getScrollHeight: () => count * itemHeight,
    } as unknown as CodeView;

    expect(resolveActiveDiffPathFromScroll(viewer, ids, 0)).toBe("f0.ts");
    expect(
      resolveActiveDiffPathFromScroll(viewer, ids, 1234 * itemHeight + header),
    ).toBe("f1234.ts");
    expect(
      resolveActiveDiffPathFromScroll(
        viewer,
        ids,
        (count - 1) * itemHeight + header,
      ),
    ).toBe(`f${count - 1}.ts`);
  });

  test("sparse trailing nulls still track the last laid-out band", () => {
    const header = DEFAULT_CODE_VIEW_FILE_METRICS.diffHeaderHeight;
    // Keep item bands taller than the sticky header so top+header stays inside the band.
    const itemHeight = header * 3;
    const laidOut = 50;
    const total = 80;
    const ids = Array.from({ length: total }, (_, i) => `f${i}.ts`);
    const viewer = {
      getTopForItem: (id: string) => {
        const n = Number(id.slice(1, -3));
        return n < laidOut ? n * itemHeight : null;
      },
      getScrollHeight: () => laidOut * itemHeight,
    } as unknown as CodeView;

    expect(
      resolveActiveDiffPathFromScroll(
        viewer,
        ids,
        (laidOut - 1) * itemHeight + header,
      ),
    ).toBe(`f${laidOut - 1}.ts`);
    expect(
      resolveActiveDiffPathFromScroll(viewer, ids, 10 * itemHeight + header),
    ).toBe("f10.ts");
  });
});
