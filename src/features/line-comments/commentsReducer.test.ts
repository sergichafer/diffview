import { describe, expect, test } from "bun:test";
import type { SelectedLineRange } from "@pierre/diffs";
import {
  commentsReducer,
  emptyCommentsStore,
  type CommentsStore,
} from "./commentsReducer";

const KEY = "/repo|main|feature";
const KEY_B = "/repo|main|other";

function range(
  start: number,
  end: number,
  side: SelectedLineRange["side"] = "additions",
): SelectedLineRange {
  return { start, end, side };
}

function startDraft(
  store: CommentsStore,
  path: string,
  lineRange: SelectedLineRange,
  nextKey: string,
  key = KEY,
): CommentsStore {
  return commentsReducer(store, {
    type: "start-draft",
    key,
    path,
    range: lineRange,
    nextKey,
  });
}

function save(
  store: CommentsStore,
  path: string,
  commentKey: string,
  message: string,
): CommentsStore {
  return commentsReducer(store, {
    type: "save",
    key: KEY,
    path,
    commentKey,
    message,
    snippet: "captured",
    language: "ts",
  });
}

describe("commentsReducer", () => {
  test("one draft at a time, including across files", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(2, 2), "d1");
    store = startDraft(store, "b.ts", range(5, 7), "d2");
    expect(store.map[KEY]?.["a.ts"]).toBeUndefined();
    const draft = store.map[KEY]?.["b.ts"]?.[0];
    expect(draft?.metadata.key).toBe("d2");
    expect(draft?.metadata.kind).toBe("draft");
    expect(draft?.side).toBe("additions");
    expect(draft?.lineNumber).toBe(7);
    expect(store.commentsRev).toBe(2);
  });

  test("occupied slot is a no-op for a second plus", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(4, 4), "d1");
    store = save(store, "a.ts", "d1", "keep");
    const occupied = startDraft(store, "a.ts", range(4, 4), "d2");
    expect(occupied).toBe(store);
    expect(store.map[KEY]?.["a.ts"]?.map((a) => a.metadata.key)).toEqual(["d1"]);
  });

  test("occupied draft slot is a no-op and does not replace the draft", () => {
    const store = startDraft(emptyCommentsStore, "a.ts", range(1, 3), "d1");
    const again = startDraft(store, "a.ts", range(3, 3), "d2");
    expect(again).toBe(store);
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.key).toBe("d1");
  });

  test("save captures trimmed message and snippet", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(8, 8), "d1");
    store = save(store, "a.ts", "d1", "  note  ");
    const meta = store.map[KEY]?.["a.ts"]?.[0]?.metadata;
    expect(meta).toMatchObject({
      kind: "saved",
      message: "note",
      snippet: "captured",
      language: "ts",
    });
  });

  test("empty save is a no-op", () => {
    const store = startDraft(emptyCommentsStore, "a.ts", range(8, 8), "d1");
    const next = save(store, "a.ts", "d1", "   ");
    expect(next).toBe(store);
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.kind).toBe("draft");
  });

  test("begin-edit turns a saved comment into the sole composer", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "s1");
    store = save(store, "a.ts", "s1", "saved");
    store = startDraft(store, "b.ts", range(2, 2), "d2");
    store = commentsReducer(store, {
      type: "begin-edit",
      key: KEY,
      path: "a.ts",
      commentKey: "s1",
    });
    expect(store.map[KEY]?.["b.ts"]).toBeUndefined();
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.kind).toBe("edit");
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.message).toBe("saved");
  });

  test("cancel restores an edit and deletes a new draft", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "s1");
    store = save(store, "a.ts", "s1", "keep me");
    store = commentsReducer(store, {
      type: "begin-edit",
      key: KEY,
      path: "a.ts",
      commentKey: "s1",
    });
    store = commentsReducer(store, {
      type: "cancel",
      key: KEY,
      path: "a.ts",
      commentKey: "s1",
    });
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata).toMatchObject({
      kind: "saved",
      message: "keep me",
    });

    store = startDraft(store, "b.ts", range(2, 2), "d2");
    store = commentsReducer(store, {
      type: "cancel",
      key: KEY,
      path: "b.ts",
      commentKey: "d2",
    });
    expect(store.map[KEY]?.["b.ts"]).toBeUndefined();
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.kind).toBe("saved");
  });

  test("starting a draft restores an in-progress edit", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "s1");
    store = save(store, "a.ts", "s1", "original");
    store = commentsReducer(store, {
      type: "begin-edit",
      key: KEY,
      path: "a.ts",
      commentKey: "s1",
    });
    store = startDraft(store, "b.ts", range(2, 2), "d2");
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.kind).toBe("saved");
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata.message).toBe("original");
    expect(store.map[KEY]?.["b.ts"]?.[0]?.metadata.kind).toBe("draft");
  });

  test("save from an edit keeps the key and writes the new message", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "s1");
    store = save(store, "a.ts", "s1", "old");
    store = commentsReducer(store, {
      type: "begin-edit",
      key: KEY,
      path: "a.ts",
      commentKey: "s1",
    });
    store = save(store, "a.ts", "s1", "new");
    expect(store.map[KEY]?.["a.ts"]?.[0]?.metadata).toMatchObject({
      kind: "saved",
      key: "s1",
      message: "new",
    });
  });

  test("delete removes a comment and drops empty paths", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "d1");
    store = save(store, "a.ts", "d1", "bye");
    store = commentsReducer(store, {
      type: "delete",
      key: KEY,
      path: "a.ts",
      commentKey: "d1",
    });
    expect(store.map[KEY]?.["a.ts"]).toBeUndefined();
    expect(store.commentsRev).toBe(3);
  });

  test("reset-key clears comments for that comparison", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "d1");
    store = commentsReducer(store, { type: "reset-key", key: KEY });
    expect(store.map[KEY]).toEqual({});
    expect(Object.keys(store.map[KEY] ?? {})).toHaveLength(0);
  });

  test("evict-key removes a closed comparison", () => {
    let store = startDraft(emptyCommentsStore, "a.ts", range(1, 1), "d1");
    store = startDraft(store, "z.ts", range(1, 1), "other", KEY_B);
    store = commentsReducer(store, { type: "evict-key", key: KEY });
    expect(KEY in store.map).toBe(false);
    expect(store.map[KEY_B]?.["z.ts"]?.[0]?.metadata.key).toBe("other");
  });

  test("start-draft without a side is a no-op", () => {
    const next = startDraft(emptyCommentsStore, "a.ts", { start: 1, end: 2 }, "d1");
    expect(next).toBe(emptyCommentsStore);
  });
});
