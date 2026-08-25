import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata, Hunk } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs/react";
import type { CommentMeta } from "./commentMeta";
import { COPY_PROMPT_PANEL_PADDING } from "./useCommentCodeView";

const { act, isValidElement, useEffect, useState, type ReactNode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useLineCommentsState } = await import("./LineCommentsProvider");
const { useCommentCodeView } = await import("./useCommentCodeView");

type CommentsApi = ReturnType<typeof useLineCommentsState>;
type ViewApi = ReturnType<typeof useCommentCodeView>;

const KEY = "/repo|main|a";

function hunk(): Hunk {
  return {
    collapsedBefore: 0,
    additionLines: 0,
    deletionLines: 0,
    hunkContent: [],
    splitLineStart: 0,
    splitLineCount: 0,
    unifiedLineStart: 0,
    unifiedLineCount: 0,
    noEOFCRDeletions: false,
    noEOFCRAdditions: false,
    additionStart: 1,
    additionCount: 2,
    additionLineIndex: 0,
    deletionStart: 1,
    deletionCount: 0,
    deletionLineIndex: 0,
  };
}

function item(path: string): CodeViewDiffItem<CommentMeta> {
  const fileDiff: FileDiffMetadata = {
    name: path,
    type: "change",
    isPartial: false,
    splitLineCount: 0,
    unifiedLineCount: 0,
    additionLines: ["const x = 1\n", "const y = 2\n"],
    deletionLines: [],
    hunks: [hunk()],
    lang: "ts",
  };
  return { id: path, type: "diff", fileDiff };
}

type CardHandlers = {
  onSave: (message: string) => void;
  onDiscard: () => void;
  onSelectRange: () => void;
};

function cardHandlers(node: ReactNode): CardHandlers {
  if (!isValidElement(node)) throw new Error("expected comment card");
  return node.props as CardHandlers;
}

function mountView(args: {
  items: CodeViewDiffItem<CommentMeta>[];
  editingPaths?: ReadonlySet<string>;
  activeKey?: string | null;
}): {
  comments: () => CommentsApi;
  view: () => ViewApi;
  setActiveKey: (key: string | null) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let commentsLatest: CommentsApi | null = null;
  let viewLatest: ViewApi | null = null;
  let setKey: ((key: string | null) => void) | null = null;
  const editingPaths = args.editingPaths ?? new Set<string>();

  function Harness() {
    const [activeKey, set] = useState<string | null>(args.activeKey ?? KEY);
    useEffect(() => {
      setKey = set;
    }, []);
    const comments = useLineCommentsState({
      activeKey,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY]),
    });
    const view = useCommentCodeView({
      comments,
      displayItems: args.items,
      editingPaths,
      activeKey,
    });
    commentsLatest = comments;
    viewLatest = view;
    return view.chip;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    comments: () => {
      if (!commentsLatest) throw new Error("comments not mounted");
      return commentsLatest;
    },
    view: () => {
      if (!viewLatest) throw new Error("view not mounted");
      return viewLatest;
    },
    setActiveKey: (key) => {
      act(() => setKey?.(key));
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useCommentCodeView", () => {
  test("gutter create is ignored while the file is in edit, and for non-diff items", () => {
    const h = mountView({
      items: [item("a.ts"), item("b.ts")],
      editingPaths: new Set(["a.ts"]),
    });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(range, { item: item("a.ts") });
      h.view().onGutterUtilityClick(range, {
        item: {
          id: "b.ts",
          type: "file",
          file: { name: "b.ts", contents: "" },
        },
      });
    });
    expect(h.comments().pathComments["a.ts"]).toBeUndefined();
    expect(h.comments().pathComments["b.ts"]).toBeUndefined();

    act(() => {
      h.view().onGutterUtilityClick(range, { item: item("b.ts") });
    });
    expect(h.comments().pathComments["b.ts"]?.length).toBe(1);
    h.unmount();
  });

  test("chip and panel padding appear only after a saved comment", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    expect(h.view().chip).toBeNull();
    expect(h.view().panelPaddingBottom).toBe(0);

    act(() => {
      h.comments().startDraft("a.ts", {
        start: 1,
        end: 2,
        side: "additions",
      });
    });
    expect(h.view().chip).toBeNull();

    const draft = h.comments().pathComments["a.ts"]?.[0];
    if (draft == null) throw new Error("expected draft");
    expect(h.view().renderAnnotation(draft, items[0]!)).not.toBeNull();

    act(() => {
      h.comments().saveComment(
        "a.ts",
        draft.metadata.key,
        "note",
        "const x = 1\nconst y = 2",
        "ts",
      );
    });
    expect(h.view().panelPaddingBottom).toBe(COPY_PROMPT_PANEL_PADDING);
    expect(h.view().chip).not.toBeNull();
    h.unmount();
  });

  test("comment range stays selected until that comment is removed", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 2, side: "additions" as const };
    expect(h.view().enableLineSelection).toBe(true);

    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });
    act(() => {
      h.view().onSelectedLinesChange(null);
    });
    expect(h.view().selectedLines).toBeNull();

    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
      h.view().onGutterUtilityClick(range, { item: items[0]! });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });
    expect(h.view().enableLineSelection).toBe(false);

    const draft = h.comments().pathComments["a.ts"]?.[0];
    if (draft == null) throw new Error("expected draft");
    act(() => {
      cardHandlers(h.view().renderAnnotation(draft, items[0]!)).onSave(
        "keep the range",
      );
    });
    expect(h.comments().pathComments["a.ts"]?.[0]?.metadata.kind).toBe("saved");
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });
    expect(h.view().enableLineSelection).toBe(false);

    act(() => {
      h.view().onSelectedLinesChange(null);
      h.view().onSelectedLinesChange({
        id: "a.ts",
        range: { start: 2, end: 2, side: "additions" },
      });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });

    const saved = h.comments().pathComments["a.ts"]?.[0];
    if (saved == null) throw new Error("expected saved comment");
    act(() => {
      cardHandlers(h.view().renderAnnotation(saved, items[0]!)).onDiscard();
    });
    expect(h.view().selectedLines).toBeNull();
    expect(h.view().enableLineSelection).toBe(true);
    h.unmount();
  });

  test("discarding a draft releases the line range", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
      h.view().onGutterUtilityClick(range, { item: items[0]! });
    });
    const draft = h.comments().pathComments["a.ts"]?.[0];
    if (draft == null) throw new Error("expected draft");
    act(() => {
      cardHandlers(h.view().renderAnnotation(draft, items[0]!)).onDiscard();
    });
    expect(h.view().selectedLines).toBeNull();
    expect(h.view().enableLineSelection).toBe(true);
    h.unmount();
  });

  test("clicking a saved comment pins that comment's range", () => {
    const items = [item("a.ts"), item("b.ts")];
    const h = mountView({ items });
    const rangeA = { start: 1, end: 1, side: "additions" as const };
    const rangeB = { start: 2, end: 2, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(rangeA, { item: items[0]! });
    });
    const draftA = h.comments().pathComments["a.ts"]?.[0];
    if (draftA == null) throw new Error("expected draft a");
    act(() => {
      cardHandlers(h.view().renderAnnotation(draftA, items[0]!)).onSave("a");
    });
    act(() => {
      h.view().onGutterUtilityClick(rangeB, { item: items[1]! });
    });
    const draftB = h.comments().pathComments["b.ts"]?.[0];
    if (draftB == null) throw new Error("expected draft b");
    act(() => {
      cardHandlers(h.view().renderAnnotation(draftB, items[1]!)).onSave("b");
    });
    expect(h.view().selectedLines).toEqual({ id: "b.ts", range: rangeB });

    const savedA = h.comments().pathComments["a.ts"]?.[0];
    if (savedA == null) throw new Error("expected saved a");
    act(() => {
      cardHandlers(h.view().renderAnnotation(savedA, items[0]!)).onSelectRange();
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range: rangeA });
    act(() => {
      h.view().onSelectedLinesChange(null);
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range: rangeA });
    h.unmount();
  });

  test("clears selected lines when the comparison key changes", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(range, { item: items[0]! });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });
    h.setActiveKey(null);
    expect(h.view().selectedLines).toBeNull();
    h.unmount();
  });

  test("renderAnnotation ignores file-shaped annotations", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const fileAnn = {
      lineNumber: 1,
      metadata: {
        kind: "saved" as const,
        key: "c1",
        message: "x",
        range: { start: 1, end: 1, side: "additions" as const },
        snippet: "",
        language: "",
      },
    };
    expect(h.view().renderAnnotation(fileAnn, items[0]!)).toBeNull();
    h.unmount();
  });
});
