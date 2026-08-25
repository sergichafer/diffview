import type {
  AnnotationSide,
  DiffLineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";

export type CommentKind = "draft" | "saved";

export type CommentMeta = {
  kind: CommentKind;
  key: string;
  message: string;
  range: SelectedLineRange;
  snippet: string;
  language: string;
};

export type PathComments = Record<string, DiffLineAnnotation<CommentMeta>[]>;

export const PROMPT_INTRO =
  "Address these review notes in the working tree. Each block is a file path, a line range, the current text of those lines, and the comment to apply.";

export function annotationAnchor(range: SelectedLineRange): {
  side: AnnotationSide;
  lineNumber: number;
} | null {
  const side = range.endSide ?? range.side;
  if (side == null) return null;
  return { side, lineNumber: range.end };
}

export function rangeLabel(range: SelectedLineRange): string {
  const side = range.endSide ?? range.side ?? "additions";
  if (range.start === range.end) return `${range.start} · ${side}`;
  return `${range.start}–${range.end} · ${side}`;
}

export function languageFromPath(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name.endsWith(".tsx")) return "tsx";
  if (name.endsWith(".ts")) return "ts";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".rs")) return "rust";
  return "";
}

export function makeAnnotation(
  range: SelectedLineRange,
  meta: CommentMeta,
): DiffLineAnnotation<CommentMeta> | null {
  const anchor = annotationAnchor(range);
  if (anchor == null) return null;
  return { ...anchor, metadata: meta };
}

export function savedComments(
  comments: PathComments,
): Array<{ path: string; meta: CommentMeta }> {
  const rows: Array<{ path: string; meta: CommentMeta }> = [];
  for (const [path, annotations] of Object.entries(comments)) {
    for (const annotation of annotations) {
      if (annotation.metadata.kind === "saved") {
        rows.push({ path, meta: annotation.metadata });
      }
    }
  }
  return rows;
}

export function savedCommentCount(comments: PathComments): number {
  return savedComments(comments).length;
}

export function buildExportPrompt(
  comments: PathComments,
): string {
  const rows = savedComments(comments);
  if (rows.length === 0) return "";

  const blocks = rows.map(({ path, meta }) => {
    const start = meta.range.start;
    const end = meta.range.end;
    const range = start === end ? `${start}` : `${start}-${end}`;
    const fence = meta.language ? `\`\`\`${meta.language}` : "```";
    return `### ${path} ${range}\n\n${fence}\n${meta.snippet}\n\`\`\`\n\n${meta.message}`;
  });

  return `${PROMPT_INTRO}\n\n${blocks.join("\n\n")}\n`;
}
