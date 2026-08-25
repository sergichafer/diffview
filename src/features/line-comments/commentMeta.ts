import type {
  DiffLineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";

export const PROMPT_INTRO =
  "Address these review notes in the working tree. Each block is a file path, a line range, the current text of those lines, and the comment to apply.";

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
export type CommentsMap = Record<ComparisonKey, PathComments>;
export type PathComment = {
  path: string;
  annotation: DiffLineAnnotation<CommentMeta>;
};

export const EMPTY_PATH_COMMENTS: PathComments = {};

export function annotationAnchor(
  range: SelectedLineRange,
): { side: "additions" | "deletions"; lineNumber: number } | null {
  const side = range.endSide ?? range.side;
  if (side == null) return null;
  return { side, lineNumber: range.end };
}

export function rangeLabel(range: SelectedLineRange): string {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (start === end) return String(start);
  return `${start}-${end}`;
}

export function languageFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".rs")) return "rust";
  return "";
}

export function makeAnnotation(
  metadata: CommentMeta,
): DiffLineAnnotation<CommentMeta> | null {
  const anchor = annotationAnchor(metadata.range);
  if (anchor == null) return null;
  return {
    side: anchor.side,
    lineNumber: anchor.lineNumber,
    metadata,
  };
}

export function savedComments(
  itemOrder: readonly string[],
  pathComments: PathComments,
): PathComment[] {
  const out: PathComment[] = [];
  for (const path of itemOrder) {
    const annotations = pathComments[path];
    if (annotations == null) continue;
    for (const annotation of annotations) {
      if (annotation.metadata.kind === "saved") {
        out.push({ path, annotation });
      }
    }
  }
  return out;
}

export function savedCommentCount(pathComments: PathComments): number {
  let count = 0;
  for (const annotations of Object.values(pathComments)) {
    for (const annotation of annotations) {
      if (annotation.metadata.kind === "saved") count += 1;
    }
  }
  return count;
}

export function buildExportPrompt(
  itemOrder: readonly string[],
  pathComments: PathComments,
): string {
  const blocks: string[] = [];
  for (const { path, annotation } of savedComments(itemOrder, pathComments)) {
    const { language, snippet, message, range } = annotation.metadata;
    blocks.push(
      `### ${path} ${rangeLabel(range)}\n\n\`\`\`${language}\n${snippet}\n\`\`\`\n\n${message}`,
    );
  }
  return `${PROMPT_INTRO}\n\n${blocks.join("\n\n")}\n`;
}
