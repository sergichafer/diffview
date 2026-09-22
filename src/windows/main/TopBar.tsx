import { useCallback, useMemo, useState } from "react";
import { useRepoSession } from "@/features/repo-session/context";
import { BranchComparePalette } from "@/features/branch-compare/BranchComparePalette";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import { CompareGraphPopover } from "@/features/compare-graph/CompareGraphPopover";
import { comparisonIsLive } from "@/features/compare-graph/graphTopology";
import {
  historyModeOf,
  type HistoryMode,
  type HistorySlice,
} from "@/features/history/historyModel";
import type { ComparisonRow } from "@/features/repo-session/types";
import { IconButton } from "@/design/IconButton";
import { branchOptionNames } from "@/features/branch-compare/branchCompare";
import { computeAppliedStat } from "@/features/branch-compare/compareStat";

interface TopBarProps {
  onOpenSettings: () => void;
  paletteOpenRequest: number;
  startupError?: string | null;
}

function topBarHistory(args: {
  repoName: string | undefined;
  baseBranch: string;
  headBranch: string;
  activeKey: string | null;
  activeRow: ComparisonRow | undefined;
  comparisons: Record<string, ComparisonRow>;
}): {
  headLabel: string;
  lead: string;
  sourceBase: string;
  sourceHead: string;
  sourceKey: string | null;
  sourceIsLive: boolean;
  selectedHead: string | null;
  mode: HistoryMode;
} {
  const history: HistorySlice | undefined = args.activeRow?.history;
  const sourceBase = history?.sourceBase ?? args.baseBranch;
  const sourceHead = history?.sourceHead ?? args.headBranch;
  const sourceKey =
    history && args.activeRow
      ? makeComparisonKey(
          args.activeRow.repoPath,
          history.sourceBase,
          history.sourceHead,
        )
      : args.activeKey;
  const sourceLiveRow = history
    ? sourceKey != null
      ? args.comparisons[sourceKey]
      : undefined
    : args.activeRow;
  const sourceIsLive = sourceLiveRow
    ? comparisonIsLive(sourceLiveRow.overview, sourceLiveRow.headBranch)
    : false;
  const headLabel = history?.label || args.headBranch || "Working tree";
  const lead = history?.detail
    ? history.detail
    : [args.repoName, args.baseBranch ? `against ${args.baseBranch}` : null]
        .filter(Boolean)
        .join(" · ");
  return {
    headLabel,
    lead,
    sourceBase,
    sourceHead,
    sourceKey,
    sourceIsLive,
    selectedHead: history?.specHead ?? null,
    mode: history ? historyModeOf(history.kind) : "range",
  };
}

export function TopBar({
  onOpenSettings,
  paletteOpenRequest,
  startupError = null,
}: TopBarProps) {
  const {
    repo,
    branches,
    baseBranch,
    headBranch,
    overview,
    fileDiffs,
    branchMetadata,
    metadataLoading,
    branchLoading,
    branchError,
    refreshOverview,
    handleComparisonChange,
    loadBranches,
    loadBranchMetadata,
    comparisons,
    activeKey,
    applyHistorySlice,
  } = useRepoSession();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [seenPaletteOpenRequest, setSeenPaletteOpenRequest] =
    useState(paletteOpenRequest);

  if (paletteOpenRequest !== seenPaletteOpenRequest) {
    setSeenPaletteOpenRequest(paletteOpenRequest);
    if (paletteOpenRequest > seenPaletteOpenRequest) {
      setPaletteOpen(true);
    }
  }

  const branchOptions = useMemo(
    () => branchOptionNames(branches),
    [branches],
  );

  const stat = useMemo(
    () => computeAppliedStat(overview?.files.length ?? 0, fileDiffs),
    [overview, fileDiffs],
  );

  const onOpenPalette = useCallback(() => {
    void loadBranches();
    void loadBranchMetadata();
  }, [loadBranches, loadBranchMetadata]);

  const activeRow = activeKey ? comparisons[activeKey] : undefined;
  const historyBar = topBarHistory({
    repoName: repo?.name,
    baseBranch,
    headBranch,
    activeKey,
    activeRow,
    comparisons,
  });

  return (
    <header className="top-bar">
      {repo && (
        <div className="topbar-copy">
          <h2 className="topbar-title">{historyBar.headLabel}</h2>
          {historyBar.lead ? (
            <p className="topbar-lead">{historyBar.lead}</p>
          ) : null}
        </div>
      )}
      <div className="topbar-zone topbar-zone-right icon-toolbar">
        {repo && (
          <BranchComparePalette
            head={headBranch}
            base={baseBranch}
            branches={branchOptions}
            metadata={branchMetadata}
            metadataLoading={metadataLoading}
            stat={stat}
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onChange={(next) => void handleComparisonChange(next)}
            onOpen={onOpenPalette}
          />
        )}
        <IconButton
          name="refresh"
          busy={branchLoading}
          disabled={!repo}
          onClick={() => void refreshOverview()}
          title={branchLoading ? "Refreshing…" : "Refresh"}
        />
        {repo && (
          <CompareGraphPopover
            repoPath={repo.path}
            sourceBase={historyBar.sourceBase}
            sourceHead={historyBar.sourceHead}
            sourceIsLive={historyBar.sourceIsLive}
            selectedHead={historyBar.selectedHead}
            mode={historyBar.mode}
            onSlice={(slice) => {
              if (!historyBar.sourceKey) return;
              applyHistorySlice(historyBar.sourceKey, slice);
            }}
          />
        )}
        {startupError && (
          <span
            className="top-bar-error"
            aria-live="assertive"
            title={startupError}
          >
            <span className="top-bar-error-icon" aria-hidden="true">
              ⚠{" "}
            </span>
            Could not open: {startupError}
          </span>
        )}
        {branchError && (
          <span className="top-bar-error" aria-live="assertive">
            <span className="top-bar-error-icon" aria-hidden="true">
              ⚠{" "}
            </span>
            Error: {branchError}
          </span>
        )}
        <IconButton name="settings" onClick={onOpenSettings} />
      </div>
    </header>
  );
}
