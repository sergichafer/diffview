import { describe, expect, test } from "bun:test";
import type { DiffLineAnnotation } from "@pierre/diffs";
import {
  annotationAnchor,
  buildExportPrompt,
  languageFromPath,
  PROMPT_INTRO,
  rangeLabel,
  savedCommentCount,
  type CommentMeta,
} from "./commentMeta";

function saved(
  path: string,
  meta: CommentMeta,
): [string, DiffLineAnnotation<CommentMeta>[]] {
  return [
    path,
    [
      {
        side: meta.range.endSide ?? meta.range.side ?? "additions",
        lineNumber: meta.range.end,
        metadata: meta,
      },
    ],
  ];
}

describe("annotationAnchor", () => {
  test("uses endSide when present", () => {
    expect(
      annotationAnchor({
        start: 10,
        side: "deletions",
        end: 14,
        endSide: "additions",
      }),
    ).toEqual({ side: "additions", lineNumber: 14 });
  });

  test("falls back to side", () => {
    expect(
      annotationAnchor({ start: 88, side: "additions", end: 88 }),
    ).toEqual({ side: "additions", lineNumber: 88 });
  });

  test("returns null without a side", () => {
    expect(annotationAnchor({ start: 1, end: 2 })).toBeNull();
  });
});

describe("rangeLabel", () => {
  test("formats a span", () => {
    expect(
      rangeLabel({ start: 142, end: 147, side: "additions" }),
    ).toBe("142–147 · additions");
  });

  test("formats a single line", () => {
    expect(
      rangeLabel({ start: 66, end: 66, side: "additions" }),
    ).toBe("66 · additions");
  });
});

describe("languageFromPath", () => {
  test("maps tsx and ts", () => {
    expect(languageFromPath("src/a.tsx")).toBe("tsx");
    expect(languageFromPath("src/a.ts")).toBe("ts");
  });
});

describe("buildExportPrompt", () => {
  test("joins intro, path, range, fence, and note", () => {
    const prompt = buildExportPrompt(
      Object.fromEntries([
        saved("src/a.tsx", {
          kind: "saved",
          key: "1",
          message: "Include loadDiffFiles in the object.",
          range: { start: 142, end: 147, side: "additions" },
          snippet: "      loadDiffFiles,",
          language: "tsx",
        }),
        saved("src/b.ts", {
          kind: "saved",
          key: "2",
          message: "Rename isLive.",
          range: { start: 66, end: 66, side: "additions" },
          snippet: "    isLive,",
          language: "ts",
        }),
      ]),
    );

    expect(prompt.startsWith(PROMPT_INTRO)).toBe(true);
    expect(prompt).toContain("### src/a.tsx 142-147");
    expect(prompt).toContain("```tsx\n      loadDiffFiles,\n```");
    expect(prompt).toContain("Include loadDiffFiles in the object.");
    expect(prompt).toContain("### src/b.ts 66");
    expect(prompt).toContain("Rename isLive.");
  });

  test("ignores drafts", () => {
    const comments = {
      "src/a.tsx": [
        {
          side: "additions" as const,
          lineNumber: 10,
          metadata: {
            kind: "draft" as const,
            key: "d",
            message: "draft",
            range: { start: 10, end: 10, side: "additions" as const },
            snippet: "x",
            language: "tsx",
          },
        },
      ],
    };
    expect(savedCommentCount(comments)).toBe(0);
    expect(buildExportPrompt(comments)).toBe("");
  });
});
