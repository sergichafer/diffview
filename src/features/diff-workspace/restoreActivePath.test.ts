import { describe, expect, test } from "bun:test";
import {
  armRestore,
  cancelRestore,
  fulfillRestoreIfReady,
  initialRestoreState,
  markRestoreFulfilled,
  tryFulfillRestore,
} from "./restoreActivePath";

describe("armRestore", () => {
  test("arms pending from selectedPath when files key changes", () => {
    const next = armRestore(initialRestoreState(), "a\0b", "foo.ts");
    expect(next).toEqual({ filesKey: "a\0b", pending: "foo.ts" });
  });

  test("arms with null when nothing was selected", () => {
    const next = armRestore(initialRestoreState(), "key", null);
    expect(next.pending).toBeNull();
    expect(next.filesKey).toBe("key");
  });

  test("same key does not re-arm", () => {
    const armed = armRestore(initialRestoreState(), "key", "a.ts");
    const again = armRestore(armed, "key", "b.ts");
    expect(again).toBe(armed);
    expect(again.pending).toBe("a.ts");
  });

  test("new key re-arms from current selectedPath", () => {
    const armed = armRestore(initialRestoreState(), "key-1", "a.ts");
    const next = armRestore(armed, "key-2", "b.ts");
    expect(next).toEqual({ filesKey: "key-2", pending: "b.ts" });
  });
});

describe("cancelRestore", () => {
  test("clears pending", () => {
    const armed = armRestore(initialRestoreState(), "key", "a.ts");
    expect(cancelRestore(armed)).toEqual({ filesKey: "key", pending: null });
  });

  test("no-op when already clear", () => {
    const state = initialRestoreState();
    expect(cancelRestore(state)).toBe(state);
  });
});

describe("tryFulfillRestore", () => {
  test("returns pending when normalized id is in displayItemIds", () => {
    expect(tryFulfillRestore("foo.ts", ["foo.ts", "bar.ts"])).toBe("foo.ts");
  });

  test("normalizes git-prefix paths before membership check", () => {
    expect(tryFulfillRestore("b/foo.ts", ["foo.ts"])).toBe("b/foo.ts");
  });

  test("returns null when item not ready", () => {
    expect(tryFulfillRestore("foo.ts", ["bar.ts"])).toBeNull();
  });

  test("returns null when nothing pending", () => {
    expect(tryFulfillRestore(null, ["foo.ts"])).toBeNull();
  });
});

describe("markRestoreFulfilled", () => {
  test("clears pending after successful scroll", () => {
    const armed = armRestore(initialRestoreState(), "key", "a.ts");
    expect(markRestoreFulfilled(armed).pending).toBeNull();
  });
});

describe("fulfillRestoreIfReady", () => {
  test("laid-out failure keeps pending for a later opportunity", () => {
    let state = armRestore(initialRestoreState(), "a\0b", "b.ts");
    const attempts: string[] = [];

    state = fulfillRestoreIfReady(state, ["a.ts", "b.ts"], (path) => {
      attempts.push(path);
      return false; // getTopForItem not ready
    });
    expect(state.pending).toBe("b.ts");
    expect(attempts).toEqual(["b.ts"]);

    state = fulfillRestoreIfReady(state, ["a.ts", "b.ts"], (path) => {
      attempts.push(path);
      return true;
    });
    expect(state.pending).toBeNull();
    expect(attempts).toEqual(["b.ts", "b.ts"]);
  });

  test("does not scroll when path not yet in displayItemIds", () => {
    const armed = armRestore(initialRestoreState(), "key", "b.ts");
    let scrolled = false;
    const next = fulfillRestoreIfReady(armed, ["a.ts"], () => {
      scrolled = true;
      return true;
    });
    expect(scrolled).toBe(false);
    expect(next.pending).toBe("b.ts");
  });

  test("no-op when nothing pending", () => {
    const state = initialRestoreState();
    const next = fulfillRestoreIfReady(state, ["a.ts"], () => true);
    expect(next).toBe(state);
  });
});
