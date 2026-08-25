export const RESTING_COPY_IDS = [
  "ai",
  "count-ai",
  "ai-prompt",
  "prompt",
  "notes",
  "count",
  "review",
  "copy",
] as const;

export type RestingCopy = (typeof RESTING_COPY_IDS)[number];

export const RESTING_COPY_OPTIONS: ReadonlyArray<{
  id: RestingCopy;
  hud: string;
}> = [
  { id: "ai", hud: "Copy for AI" },
  { id: "count-ai", hud: "Copy N for AI" },
  { id: "ai-prompt", hud: "Copy AI prompt" },
  { id: "prompt", hud: "Copy prompt" },
  { id: "notes", hud: "Copy notes" },
  { id: "count", hud: "Copy N comments" },
  { id: "review", hud: "Copy review" },
  { id: "copy", hud: "Copy" },
];

export const DEFAULT_RESTING_COPY: RestingCopy = "ai";

export function restingLabel(
  copy: RestingCopy,
  commentCount: number,
): string {
  switch (copy) {
    case "count-ai":
      return commentCount === 1
        ? "Copy 1 for AI"
        : `Copy ${commentCount} for AI`;
    case "ai-prompt":
      return "Copy AI prompt";
    case "prompt":
      return "Copy prompt";
    case "notes":
      return "Copy notes";
    case "count":
      return commentCount === 1
        ? "Copy 1 comment"
        : `Copy ${commentCount} comments`;
    case "review":
      return "Copy review";
    case "copy":
      return "Copy";
    case "ai":
      return "Copy for AI";
  }
}
