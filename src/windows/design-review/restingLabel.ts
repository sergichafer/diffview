export type RestingCopy = "review" | "count" | "ai";

export function restingLabel(
  copy: RestingCopy,
  commentCount: number,
): string {
  if (copy === "count") {
    return commentCount === 1
      ? "Copy 1 comment"
      : `Copy ${commentCount} comments`;
  }
  if (copy === "ai") return "Copy for AI";
  return "Copy review";
}
