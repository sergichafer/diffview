import { truncateBranchLabel } from "./branchLabel";
import { formatCount, type AppliedStat } from "./compareStat";

export function PaletteFooter({
  head,
  base,
  commits,
  sliced,
  stat,
}: {
  head: string;
  base: string;
  commits: number | undefined;
  /** A history slice is active. The branch commit count does not describe it. */
  sliced: boolean;
  stat: AppliedStat;
}) {
  const commitLabel =
    commits == null || sliced
      ? ""
      : `${commits} ${commits === 1 ? "commit" : "commits"} · `;
  return (
    <div className="compare-footer">
      <span className="compare-footer-pair">
        {truncateBranchLabel(head || "Working tree", 20)}{" "}
        <span className="compare-footer-arrow" aria-hidden="true">
          →
        </span>{" "}
        {truncateBranchLabel(base || "-", 20)}
      </span>
      <span className="compare-footer-stat">
        {commitLabel}
        {stat.files} {stat.files === 1 ? "file" : "files"} ·{" "}
        <span className="compare-add">+{formatCount(stat.additions)}</span>{" "}
        <span className="compare-del">−{formatCount(stat.deletions)}</span>
      </span>
    </div>
  );
}
