import { describe, expect, test } from "bun:test";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import {
  PROMPT_INTRO,
  activeDraft,
  annotationAnchor,
  buildExportPrompt,
  findComment,
  languageFromPath,
  makeAnnotation,
  rangeLabel,
  savedCommentCount,
  savedComments,
  type CommentMeta,
  type PathComments,
} from "./commentMeta";

function range(
  start: number,
  end: number,
  side: SelectedLineRange["side"] = "additions",
  endSide?: SelectedLineRange["endSide"],
): SelectedLineRange {
  return endSide != null ? { start, end, side, endSide } : { start, end, side };
}

function saved(
  path: string,
  key: string,
  message: string,
  lineRange: SelectedLineRange,
  snippet: string,
  language: string,
): DiffLineAnnotation<CommentMeta> {
  const annotation = makeAnnotation({
    kind: "saved",
    key,
    message,
    range: lineRange,
    snippet,
    language,
  });
  if (annotation == null) throw new Error("expected annotation");
  return annotation;
}

describe("annotationAnchor", () => {
  test("parks on endSide and range.end", () => {
    expect(annotationAnchor(range(10, 14, "deletions", "additions"))).toEqual({
      side: "additions",
      lineNumber: 14,
    });
  });

  test("falls back to side when endSide is omitted", () => {
    expect(annotationAnchor(range(3, 3, "deletions"))).toEqual({
      side: "deletions",
      lineNumber: 3,
    });
  });

  test("returns null when no side is present", () => {
    expect(annotationAnchor({ start: 1, end: 2 })).toBeNull();
  });
});

describe("rangeLabel", () => {
  test("uses a single number for one line", () => {
    expect(rangeLabel(range(142, 142))).toBe("142");
  });

  test("uses a hyphen span regardless of drag direction", () => {
    expect(rangeLabel(range(142, 147))).toBe("142-147");
    expect(rangeLabel(range(147, 142))).toBe("142-147");
  });
});

describe("languageFromPath", () => {
  test("maps known suffixes and otherwise returns empty", () => {
    expect(languageFromPath("src/App.tsx")).toBe("tsx");
    expect(languageFromPath("src/lib.ts")).toBe("ts");
    expect(languageFromPath("src/design/app.css")).toBe("css");
    expect(languageFromPath("src-tauri/src/lib.rs")).toBe("rust");
    expect(languageFromPath("README.md")).toBe("");
  });
});

describe("findComment and activeDraft", () => {
  test("findComment walks paths and ignores a null key", () => {
    const pathComments: PathComments = {
      "a.ts": [saved("a.ts", "s1", "one", range(1, 1), "x", "ts")],
      "b.ts": [saved("b.ts", "s2", "two", range(2, 2), "y", "ts")],
    };
    expect(findComment(pathComments, null)).toBeNull();
    expect(findComment(pathComments, "missing")).toBeNull();
    expect(findComment(pathComments, "s2")?.path).toBe("b.ts");
  });

  test("activeDraft returns the sole draft", () => {
    const draft = makeAnnotation({
      kind: "draft",
      key: "d1",
      message: "",
      range: range(4, 4),
      snippet: "",
      language: "ts",
    });
    if (draft == null) throw new Error("expected draft");
    const pathComments: PathComments = {
      "a.ts": [saved("a.ts", "s1", "one", range(1, 1), "x", "ts")],
      "b.ts": [draft],
    };
    expect(activeDraft(pathComments)?.annotation.metadata.key).toBe("d1");
    expect(activeDraft({ "a.ts": pathComments["a.ts"]! })).toBeNull();
  });
});

describe("buildExportPrompt", () => {
  test("writes intro, file order, annotation order, and omits drafts", () => {
    const draft = makeAnnotation({
      kind: "draft",
      key: "d1",
      message: "ignore me",
      range: range(9, 9),
      snippet: "nope",
      language: "ts",
    });
    if (draft == null) throw new Error("expected draft");
    const pathComments: PathComments = {
      "b.ts": [
        saved("b.ts", "s2", "second", range(3, 4), "line3\nline4", "ts"),
      ],
      "a.ts": [
        draft,
        saved("a.ts", "s1", "first\nnote", range(142, 142), "const x = 1", "ts"),
      ],
    };
    const prompt = buildExportPrompt(["a.ts", "b.ts"], pathComments);
    expect(prompt).toBe(
      `${PROMPT_INTRO}

### a.ts 142

\`\`\`ts
const x = 1
\`\`\`

first
note

### b.ts 3-4

\`\`\`ts
line3
line4
\`\`\`

second
`,
    );
    expect(prompt.endsWith("\n")).toBe(true);
    expect(savedCommentCount(pathComments)).toBe(2);
    expect(savedComments(["a.ts", "b.ts"], pathComments).map((row) => row.annotation.metadata.key)).toEqual(
      ["s1", "s2"],
    );
  });

  test("uses an empty fence language when none is stored", () => {
    const pathComments: PathComments = {
      "notes.md": [
        saved("notes.md", "s", "fix this", range(1, 1), "# title", ""),
      ],
    };
    const prompt = buildExportPrompt(["notes.md"], pathComments);
    expect(prompt).toContain("```\n# title\n```\n");
  });
});
