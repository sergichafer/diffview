import { describe, expect, test } from "bun:test";
import { loadAllFileDiffs } from "./loadAllFileDiffs";
import type { FileDiffResult } from "@/shared/types/app";

function diff(path: string): FileDiffResult {
  return { path, patch: "", isBinary: false, oldPath: null };
}

describe("loadAllFileDiffs", () => {
  test("fetches paths in batches and dispatches each result", async () => {
    const fetched: string[][] = [];
    const batches: FileDiffResult[][] = [];

    await loadAllFileDiffs({
      paths: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
      batchSize: 2,
      concurrency: 1,
      fetchBatch: async (paths) => {
        fetched.push(paths);
        return paths.map(diff);
      },
      onBatch: (results) => batches.push(results),
      isStale: () => false,
    });

    expect(fetched).toEqual([
      ["a.ts", "b.ts"],
      ["c.ts", "d.ts"],
      ["e.ts"],
    ]);
    expect(batches).toHaveLength(3);
    expect(batches.flat().map((item) => item.path)).toEqual([
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
      "e.ts",
    ]);
  });

  test("stops dispatching when refresh becomes stale", async () => {
    let stale = false;
    const dispatched: string[] = [];

    await loadAllFileDiffs({
      paths: ["a.ts", "b.ts", "c.ts", "d.ts"],
      batchSize: 1,
      concurrency: 1,
      fetchBatch: async (paths) => {
        if (paths[0] === "b.ts") stale = true;
        return paths.map(diff);
      },
      onBatch: (results) => {
        dispatched.push(...results.map((item) => item.path));
      },
      isStale: () => stale,
    });

    expect(dispatched).toEqual(["a.ts"]);
  });

  test("runs multiple batches concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await loadAllFileDiffs({
      paths: ["a.ts", "b.ts", "c.ts", "d.ts"],
      batchSize: 1,
      concurrency: 2,
      fetchBatch: async (paths) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return paths.map(diff);
      },
      onBatch: () => {},
      isStale: () => false,
    });

    expect(maxInFlight).toBe(2);
  });
});
