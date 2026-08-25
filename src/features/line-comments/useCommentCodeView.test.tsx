import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata, Hunk } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs/react";
import type { CommentMeta } from "./commentMeta";
import { COPY_PROMPT_PANEL_PADDING } from "./useCommentCodeView";

const { act, useEffect, useState } = await import("react");
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

function mountView(args: {
  items: CodeViewDiffItem<CommentMeta>[];
  editingPaths?: ReadonlySet<string>;
  activeKey?: string | null;
}): {
  comments: () => CommentsApi;
  view: () => ViewApi;
  host: HTMLElement;
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
    return (
      <>
        {args.items.flatMap((row) => {
          const annotations = comments.pathComments[row.id];
          if (annotations == null) return [];
          return annotations.map((annotation) => (
            <div key={annotation.metadata.key}>
              {view.renderAnnotation(annotation, row)}
            </div>
          ));
        })}
        {view.chip}
      </>
    );
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
    host: container,
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

  test("selection stays user-controlled after comments are saved", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 2, side: "additions" as const };
    const nextRange = { start: 2, end: 2, side: "additions" as const };

    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });
    act(() => {
      h.view().onSelectedLinesChange(null);
    });
    expect(h.view().selectedLines).toBeNull();

    act(() => {
      h.view().onGutterUtilityClick(range, { item: items[0]! });
    });
    expect(h.view().selectedLines).toBeNull();
    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });

    const draft = h.comments().pathComments["a.ts"]?.[0];
    if (draft == null) throw new Error("expected draft");
    act(() => {
      h.comments().saveComment(
        "a.ts",
        draft.metadata.key,
        "keep the range",
        "const x = 1\nconst y = 2",
        "ts",
      );
    });
    expect(h.comments().pathComments["a.ts"]?.[0]?.metadata.kind).toBe("saved");
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range });

    act(() => {
      h.view().onSelectedLinesChange(null);
      h.view().onSelectedLinesChange({ id: "a.ts", range: nextRange });
    });
    expect(h.view().selectedLines).toEqual({ id: "a.ts", range: nextRange });
    expect(h.comments().pathComments["a.ts"]?.[0]?.metadata.range).toEqual(
      range,
    );
    h.unmount();
  });

  test("saving from the card clears selection only when it still covers that range", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(range, { item: items[0]! });
      h.view().onSelectedLinesChange({ id: "a.ts", range });
    });
    const textarea = h.host.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer");
    }
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "keep");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...h.host.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Save",
    );
    if (!(save instanceof HTMLButtonElement)) throw new Error("missing save");
    act(() => {
      save.click();
    });
    expect(h.comments().pathComments["a.ts"]?.[0]?.metadata.kind).toBe("saved");
    expect(h.view().selectedLines).toBeNull();
    h.unmount();
  });

  test("saving leaves a selection that is not on that comment", () => {
    const items = [item("a.ts"), item("b.ts")];
    const h = mountView({ items });
    const rangeA = { start: 1, end: 1, side: "additions" as const };
    const rangeB = { start: 2, end: 2, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(rangeA, { item: items[0]! });
      h.view().onSelectedLinesChange({ id: "b.ts", range: rangeB });
    });
    const textarea = h.host.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer");
    }
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "keep");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...h.host.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Save",
    );
    if (!(save instanceof HTMLButtonElement)) throw new Error("missing save");
    act(() => {
      save.click();
    });
    expect(h.comments().pathComments["a.ts"]?.[0]?.metadata.kind).toBe("saved");
    expect(h.view().selectedLines).toEqual({ id: "b.ts", range: rangeB });
    h.unmount();
  });

  test("discarding a draft from the card clears the selection", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(range, { item: items[0]! });
      h.view().onSelectedLinesChange({ id: "a.ts", range });
    });
    const cancel = [...h.host.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Cancel",
    );
    if (!(cancel instanceof HTMLButtonElement)) {
      throw new Error("missing cancel");
    }
    act(() => {
      cancel.click();
    });
    expect(h.comments().pathComments["a.ts"]).toBeUndefined();
    expect(h.view().selectedLines).toBeNull();
    h.unmount();
  });

  test("editing a saved comment does not steal the current selection", () => {
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
      h.comments().saveComment("a.ts", draftA.metadata.key, "a", "x", "ts");
      h.view().onSelectedLinesChange({ id: "b.ts", range: rangeB });
    });
    act(() => {
      h.comments().beginEdit("a.ts", draftA.metadata.key);
    });
    expect(h.view().selectedLines).toEqual({ id: "b.ts", range: rangeB });
    h.unmount();
  });

  test("deleting a saved comment leaves a selection on another file", () => {
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
      h.comments().saveComment("a.ts", draftA.metadata.key, "a", "x", "ts");
      h.view().onSelectedLinesChange({ id: "b.ts", range: rangeB });
    });
    const remove = [...h.host.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Delete",
    );
    if (!(remove instanceof HTMLButtonElement)) throw new Error("missing delete");
    act(() => {
      remove.click();
    });
    expect(h.comments().pathComments["a.ts"]).toBeUndefined();
    expect(h.view().selectedLines).toEqual({ id: "b.ts", range: rangeB });
    h.unmount();
  });

  test("onPostRender paints comment ranges without touching selectedLines", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 2, side: "additions" as const };
    act(() => {
      h.view().onGutterUtilityClick(range, { item: items[0]! });
    });
    const draft = h.comments().pathComments["a.ts"]?.[0];
    if (draft == null) throw new Error("expected draft");
    const host = document.createElement("div");
    host.innerHTML = `
      <pre data-diff-type="unified">
        <code data-code>
          <div data-gutter>
            <div data-column-number="1" data-line-index="0,0"></div>
            <div data-column-number="2" data-line-index="1,1"></div>
          </div>
          <div data-content>
            <div data-line="1" data-line-index="0,0"></div>
            <div data-line="2" data-line-index="1,1"></div>
          </div>
        </code>
      </pre>
    `;
    act(() => {
      h.view().onPostRender(
        host,
        {
          getLineIndex: (lineNumber: number): [number, number] => [
            lineNumber - 1,
            lineNumber - 1,
          ],
        },
        "update",
        { item: { ...items[0]!, annotations: [draft] } },
      );
    });
    expect(
      host.querySelector('[data-line="1"]')?.hasAttribute("data-comment-line"),
    ).toBe(true);
    expect(
      host.querySelector('[data-line="2"]')?.hasAttribute("data-comment-line"),
    ).toBe(true);
    expect(h.view().selectedLines).toBeNull();
    h.unmount();
  });

  test("clears selected lines when the comparison key changes", () => {
    const items = [item("a.ts")];
    const h = mountView({ items });
    const range = { start: 1, end: 1, side: "additions" as const };
    act(() => {
      h.view().onSelectedLinesChange({ id: "a.ts", range });
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
