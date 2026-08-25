import { describe, expect, test } from "bun:test";
import type { SelectedLineRange } from "@pierre/diffs";
import {
  COMMENT_LINE_ATTR,
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

function rowsOf(
  occupied: ReturnType<typeof occupyCommentRows>,
  column: "unified" | "additions" | "deletions",
): number[] {
  return [...(occupied.get(column) ?? [])].sort((a, b) => a - b);
}

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

function paintedKeys(host: ParentNode): string[] {
  return [...host.querySelectorAll(`[${COMMENT_LINE_ATTR}]`)].map(
    (el) =>
      el.getAttribute("data-line") ??
      el.getAttribute("data-column-number") ??
      el.getAttribute("data-gutter-buffer") ??
      el.tagName,
  );
}

describe("paintCommentLines", () => {
  test("paints the comment span and leaves other rows alone", () => {
    const host = mockUnifiedHost();
    paintCommentLines(host, identityIndex, [range(1, 2)]);
    expect(paintedKeys(host)).toEqual(["1", "2", "1", "2"]);
    expect(
      host.querySelector('[data-line="3"]')?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(false);
  });

  test("clears stale marks when comments are gone", () => {
    const host = mockUnifiedHost();
    paintCommentLines(host, identityIndex, [range(1, 1)]);
    expect(host.querySelectorAll(`[${COMMENT_LINE_ATTR}]`).length).toBe(2);
    paintCommentLines(host, identityIndex, []);
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
    paintCommentLines(host, identityIndex, [range(1, 1, "additions")]);
    expect(
      host
        .querySelector("[data-additions] [data-line]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-deletions] [data-line]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(false);
  });

  test("marks the annotation slot on the occupied row", () => {
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
    paintCommentLines(host, () => [0, 0], [range(4, 4)]);
    expect(
      host.querySelector("[data-line]")?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-line-annotation]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-gutter-buffer]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
  });

  test("stamps by line-index even when gutter and content children are offset", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <pre data-diff-type="unified">
        <code data-code>
          <div data-gutter>
            <div data-spacer></div>
            <div data-column-number="1" data-line-index="0,0"></div>
            <div data-gutter-buffer></div>
          </div>
          <div data-content>
            <div data-line="1" data-line-index="0,0"></div>
            <div data-line-annotation></div>
          </div>
        </code>
      </pre>
    `;
    paintCommentLines(host, () => [0, 0], [range(1, 1)]);
    expect(
      host.querySelector("[data-line]")?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-column-number]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-line-annotation]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host
        .querySelector("[data-gutter-buffer]")
        ?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
    expect(
      host.querySelector("[data-spacer]")?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(false);
  });

  test("reads through an open shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const inner = mockUnifiedHost();
    shadow.append(...inner.childNodes);
    paintCommentLines(host, identityIndex, [range(3, 3)]);
    expect(
      shadow.querySelector('[data-line="3"]')?.hasAttribute(COMMENT_LINE_ATTR),
    ).toBe(true);
  });
});
