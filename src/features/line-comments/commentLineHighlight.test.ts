import { describe, expect, test } from "bun:test";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import type { CommentMeta } from "./commentMeta";
import {
  COMMENT_LINE_ATTR,
  commentLineKind,
  occupyCommentRows,
  paintCommentLines,
} from "./commentLineHighlight";

function identityIndex(
  lineNumber: number,
  _side?: "additions" | "deletions",
): [number, number] {
  return [lineNumber - 1, lineNumber - 1];
}

function range(
  start: number,
  end: number,
  side: SelectedLineRange["side"] = "additions",
  endSide?: SelectedLineRange["endSide"],
): SelectedLineRange {
  return endSide != null ? { start, end, side, endSide } : { start, end, side };
}

function annotation(lineRange: SelectedLineRange): DiffLineAnnotation<CommentMeta> {
  return {
    side: lineRange.endSide ?? lineRange.side ?? "additions",
    lineNumber: lineRange.end,
    metadata: {
      kind: "saved",
      key: "c1",
      message: "note",
      range: lineRange,
      snippet: "x",
      language: "ts",
    },
  };
}

function rowsOf(
  occupied: ReturnType<typeof occupyCommentRows>,
  column: "unified" | "additions" | "deletions",
): number[] {
  return [...(occupied.get(column) ?? [])].sort((a, b) => a - b);
}

describe("commentLineKind", () => {
  test("marks single, first, middle, and last from occupancy", () => {
    const occupied = new Set([2, 3, 4]);
    expect(commentLineKind(2, occupied)).toBe("first");
    expect(commentLineKind(3, occupied)).toBe("");
    expect(commentLineKind(4, occupied)).toBe("last");
    expect(commentLineKind(5, new Set([5]))).toBe("single");
  });
});

describe("occupyCommentRows", () => {
  test("skips ranges with no side", () => {
    expect(occupyCommentRows([{ start: 1, end: 2 }], false, identityIndex).size).toBe(
      0,
    );
  });

  test("fills a unified span from Pierre indices", () => {
    const occupied = occupyCommentRows([range(2, 4)], false, identityIndex);
    expect(rowsOf(occupied, "unified")).toEqual([1, 2, 3]);
    expect(occupied.has("additions")).toBe(false);
  });

  test("keeps split ranges on their side and does not fill gaps", () => {
    const occupied = occupyCommentRows(
      [range(1, 2), range(5, 5, "deletions")],
      true,
      identityIndex,
    );
    expect(rowsOf(occupied, "additions")).toEqual([0, 1]);
    expect(rowsOf(occupied, "deletions")).toEqual([4]);
    expect(occupied.has("unified")).toBe(false);
  });

  test("paints each endpoint when the range crosses sides", () => {
    const occupied = occupyCommentRows(
      [range(3, 8, "deletions", "additions")],
      true,
      identityIndex,
    );
    expect(rowsOf(occupied, "deletions")).toEqual([2]);
    expect(rowsOf(occupied, "additions")).toEqual([7]);
  });
});

function mockUnifiedHost(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = `
    <pre data-diff-type="unified">
      <code data-code>
        <div data-gutter>
          <div data-column-number="1" data-line-index="0,0"></div>
          <div data-column-number="2" data-line-index="1,1"></div>
          <div data-column-number="3" data-line-index="2,2"></div>
        </div>
        <div data-content>
          <div data-line="1" data-line-index="0,0"></div>
          <div data-line="2" data-line-index="1,1"></div>
          <div data-line="3" data-line-index="2,2"></div>
        </div>
      </code>
    </pre>
  `;
  return host;
}

describe("paintCommentLines", () => {
  test("paints the comment span and leaves other rows alone", () => {
    const host = mockUnifiedHost();
    paintCommentLines(host, { getLineIndex: identityIndex }, [
      annotation(range(1, 2)),
    ]);
    const painted = [...host.querySelectorAll(`[${COMMENT_LINE_ATTR}]`)].map(
      (el) => [
        el.getAttribute("data-line") ?? el.getAttribute("data-column-number"),
        el.getAttribute(COMMENT_LINE_ATTR),
      ],
    );
    expect(painted).toEqual([
      ["1", "first"],
      ["2", "last"],
      ["1", "first"],
      ["2", "last"],
    ]);
    expect(
      host.querySelector('[data-line="3"]')?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(false);
  });

  test("clears stale marks when comments are gone", () => {
    const host = mockUnifiedHost();
    paintCommentLines(host, { getLineIndex: identityIndex }, [
      annotation(range(1, 1)),
    ]);
    expect(host.querySelectorAll(`[${COMMENT_LINE_ATTR}]`).length).toBe(2);
    paintCommentLines(host, { getLineIndex: identityIndex }, []);
    expect(host.querySelectorAll(`[${COMMENT_LINE_ATTR}]`).length).toBe(0);
  });

  test("paints only the matching split column", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <pre data-diff-type="split">
        <code data-code data-deletions>
          <div data-gutter>
            <div data-column-number="1" data-line-index="0,0"></div>
          </div>
          <div data-content>
            <div data-line="1" data-line-index="0,0"></div>
          </div>
        </code>
        <code data-code data-additions>
          <div data-gutter>
            <div data-column-number="1" data-line-index="0,0"></div>
          </div>
          <div data-content>
            <div data-line="1" data-line-index="0,0"></div>
          </div>
        </code>
      </pre>
    `;
    paintCommentLines(host, { getLineIndex: identityIndex }, [
      annotation(range(1, 1, "additions")),
    ]);
    expect(
      host
        .querySelector("[data-additions] [data-line]")
        ?.getAttribute(COMMENT_LINE_ATTR),
    ).toBe("single");
    expect(
      host
        .querySelector("[data-deletions] [data-line]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(false);
  });

  test("extends first/last onto an annotation slot like Pierre selection", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <pre data-diff-type="unified">
        <code data-code>
          <div data-gutter>
            <div data-column-number="4" data-line-index="0,0"></div>
            <div data-gutter-buffer></div>
          </div>
          <div data-content>
            <div data-line="4" data-line-index="0,0"></div>
            <div data-line-annotation></div>
          </div>
        </code>
      </pre>
    `;
    paintCommentLines(
      host,
      { getLineIndex: () => [0, 0] },
      [annotation(range(4, 4))],
    );
    expect(
      host.querySelector("[data-line]")?.getAttribute(COMMENT_LINE_ATTR),
    ).toBe("first");
    expect(
      host
        .querySelector("[data-line-annotation]")
        ?.getAttribute(COMMENT_LINE_ATTR),
    ).toBe("last");
    expect(
      host
        .querySelector("[data-gutter-buffer]")
        ?.getAttribute(COMMENT_LINE_ATTR),
    ).toBe("last");
  });

  test("reads through an open shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const inner = mockUnifiedHost();
    shadow.append(...inner.childNodes);
    paintCommentLines(host, { getLineIndex: identityIndex }, [
      annotation(range(3, 3)),
    ]);
    expect(
      shadow.querySelector('[data-line="3"]')?.getAttribute(COMMENT_LINE_ATTR),
    ).toBe("single");
  });
});
