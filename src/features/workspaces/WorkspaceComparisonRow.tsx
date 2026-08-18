import { IconGlyph } from "@/design/IconButton";
import { computeAppliedStat } from "@/features/branch-compare/compareStat";
import type { ComparisonRow } from "@/features/repo-session/types";
import { repoInitial } from "./labels";

const WIP_TITLE =
  "WIP: checked-out head. Diffs and saves write the working tree.";
const OUTDATED_TITLE =
  "Outdated: refs moved while idle. Recalculates on visit.";

function HangDelta({ row }: { row: ComparisonRow }) {
  const fileCount = row.overview?.files.length ?? null;
  const showHot =
    !row.loading &&
    row.residency === "hot" &&
    row.fileDiffs.length > 0 &&
    fileCount != null;
  const stat = showHot
    ? computeAppliedStat(fileCount, row.fileDiffs)
    : null;

  return (
    <span className="workspaces-stat">
      {fileCount != null && (
        <span className="workspaces-stat-files">{fileCount} files</span>
      )}
      <span className="workspaces-stat-changes">
        {row.loading ? (
          <span
            className="workspaces-spin"
            role="status"
            aria-label={
              fileCount != null ? "Loading diffstat" : "Loading comparison"
            }
          />
        ) : stat ? (
          <>
            <span className="workspaces-add">+{stat.additions}</span>
            &nbsp;
            <span className="workspaces-del">−{stat.deletions}</span>
          </>
        ) : null}
      </span>
    </span>
  );
}

interface WorkspaceComparisonRowProps {
  row: ComparisonRow;
  repoName: string;
  selected: boolean;
  panelFocused: boolean;
  tabIndex: number;
  onActivate: () => void;
  onClose: () => void;
  onFocus: () => void;
}

export function WorkspaceComparisonRow({
  row,
  repoName,
  selected,
  panelFocused,
  tabIndex,
  onActivate,
  onClose,
  onFocus,
}: WorkspaceComparisonRowProps) {
  const headLabel = row.headBranch || "Working tree";
  return (
    <div
      className={[
        "workspaces-row",
        selected && panelFocused ? "is-active" : "",
        selected && !panelFocused ? "is-inactive-sel" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="treeitem"
      aria-selected={selected}
      tabIndex={tabIndex}
      title={`${headLabel} → ${row.baseBranch}${row.isLive ? " (WIP)" : ""}`}
      data-ws-key={row.key}
      data-press=""
      onClick={onActivate}
      onFocus={onFocus}
    >
      <span className="workspaces-well" aria-hidden="true">
        {repoInitial(repoName)}
      </span>
      <span className="workspaces-row-body">
        <span className="workspaces-row-head">{headLabel}</span>
        <span className="workspaces-row-sub">
          <span className="workspaces-arrow" aria-hidden="true">
            →
          </span>
          <span className="workspaces-base">{row.baseBranch}</span>
          {row.isLive && (
            <>
              <span className="workspaces-dot" aria-hidden="true">
                ·
              </span>
              <span className="workspaces-wip" title={WIP_TITLE}>
                WIP
              </span>
            </>
          )}
          {row.outdated && (
            <span
              className="workspaces-chip workspaces-chip-stale"
              title={OUTDATED_TITLE}
            >
              <IconGlyph name="refresh" />
              Outdated
            </span>
          )}
        </span>
        <HangDelta row={row} />
      </span>
      <button
        type="button"
        className="workspaces-icon"
        data-press=""
        aria-label={`Close comparison ${headLabel} to ${row.baseBranch}`}
        title="Close comparison"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <IconGlyph name="close" />
      </button>
    </div>
  );
}
