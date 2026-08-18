import { describe, expect, test } from "bun:test";
import {
  armRestore,
  fulfillRestoreIfReady,
  initialRestoreState,
  rearmRestoreOnPanelMount,
  type RestoreState,
} from "./restoreActivePath";

/**
 * Reopen mount sequence that fix-1 missed.
 * BranchWorkspace stays mounted; restore arms and fulfills once; CodeView
 * unmounts (fileDiffs cleared / panel key / itemCount gate) and remounts with
 * the same filesKey. armRestore is a no-op, pending stays null, and the diff
 * sits at the top while selectedPath/tree still show the seeded file.
 */
function simulateReopenSequence(opts: {
  rearmOnPanelMount: boolean;
}): { scrolls: string[]; finalPending: string | null } {
  const filesKey = "a.ts\0b.ts\0c.ts";
  const seed = "c.ts";
  const scrolls: string[] = [];

  let state: RestoreState = initialRestoreState();
  // Overview paint: arm from seed (selectedPath already reconciled).
  state = armRestore(state, filesKey, seed);

  // First CodeView mount after batch 1 (seed not ready yet).
  if (opts.rearmOnPanelMount) {
    state = rearmRestoreOnPanelMount(state, seed);
  }
  state = fulfillRestoreIfReady(state, ["a.ts"], (path) => {
    scrolls.push(`early:${path}`);
    return true;
  });
  expect(state.pending).toBe(seed);

  // Seed batch arrives; restore succeeds (fix-1's retry path).
  state = fulfillRestoreIfReady(state, ["a.ts", "b.ts", "c.ts"], (path) => {
    scrolls.push(`ok:${path}`);
    return true;
  });
  expect(state.pending).toBeNull();
  expect(scrolls).toContain("ok:c.ts");

  // Same overview identity refresh / Strict Mode second overview / panel key:
  // fileDiffs cleared → CodeView unmounts → remounts. filesKey unchanged.
  state = armRestore(state, filesKey, seed);
  expect(state.pending).toBeNull(); // arm is intentionally one-shot per key

  if (opts.rearmOnPanelMount) {
    state = rearmRestoreOnPanelMount(state, seed);
  }

  state = fulfillRestoreIfReady(state, ["a.ts", "b.ts", "c.ts"], (path) => {
    scrolls.push(`remount:${path}`);
    return true;
  });

  return { scrolls, finalPending: state.pending };
}

describe("reopen restore sequence (CodeView remount)", () => {
  test("WITHOUT panel re-arm: fulfill then remount never scrolls again", () => {
    const { scrolls, finalPending } = simulateReopenSequence({
      rearmOnPanelMount: false,
    });
    expect(scrolls.filter((s) => s.startsWith("remount:"))).toEqual([]);
    expect(finalPending).toBeNull();
  });

  test("WITH panel re-arm: remount scrolls to seed again", () => {
    const { scrolls, finalPending } = simulateReopenSequence({
      rearmOnPanelMount: true,
    });
    expect(scrolls).toContain("remount:c.ts");
    expect(finalPending).toBeNull();
  });

  test("rearmRestoreOnPanelMount is no-op before overview arm", () => {
    const next = rearmRestoreOnPanelMount(initialRestoreState(), "c.ts");
    expect(next.pending).toBeNull();
    expect(next.filesKey).toBe("");
  });

  test("rearmRestoreOnPanelMount does not invent a path", () => {
    const armed = armRestore(initialRestoreState(), "key", "a.ts");
    const fulfilled = fulfillRestoreIfReady(armed, ["a.ts"], () => true);
    const next = rearmRestoreOnPanelMount(fulfilled, null);
    expect(next.pending).toBeNull();
  });
});
