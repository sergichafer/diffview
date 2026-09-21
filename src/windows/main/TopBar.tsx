import { useCallback, useMemo, useState } from "react";
import { useRepoSession } from "@/features/repo-session/context";
import { BranchComparePalette } from "@/features/branch-compare/BranchComparePalette";
import { CompareGraphPopover } from "@/features/compare-graph/CompareGraphPopover";
import { comparisonIsLive } from "@/features/compare-graph/graphTopology";
import type { HistoryMode } from "@/features/history/historyModel";
import { IconButton } from "@/design/IconButton";
import { branchOptionNames } from "@/features/branch-compare/branchCompare";
import { computeAppliedStat } from "@/features/branch-compare/compareStat";
import { api } from "@/shared/tauri/api";

interface TopBarProps {
  onOpenSettings: () => void;
  paletteOpenRequest: number;
  startupError?: string | null;
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
  const sourceRow =
    activeRow?.ephemeral && activeRow.ephemeralSourceKey
      ? (comparisons[activeRow.ephemeralSourceKey] ?? activeRow)
      : activeRow;
  const headLabel = activeRow?.historyLabel || headBranch || "Working tree";
  const lead = activeRow?.historyDetail
    ? activeRow.historyDetail
    : [repo?.name, baseBranch ? `against ${baseBranch}` : null]
        .filter(Boolean)
        .join(" · ");
  const sourceIsLive = comparisonIsLive(
    sourceRow?.overview ?? null,
    sourceRow?.headBranch ?? "",
  );
  const sliceMode: HistoryMode | undefined =
    activeRow?.historyMark === "this commit"
      ? "commit"
      : activeRow?.historyMark === "through here" ||
          activeRow?.historyMark === "merge-base"
        ? "range"
        : undefined;
  const sourcePath = sourceRow?.repoPath;
  const sourceBase = sourceRow?.baseBranch;
  const sourceHead = sourceRow?.headBranch;
  const loadLane = useCallback(() => {
    if (!sourcePath || sourceBase == null || sourceHead == null) {
      return Promise.reject(new Error("No comparison"));
    }
    return api.getHistoryLane(sourcePath, sourceBase, sourceHead);
  }, [sourcePath, sourceBase, sourceHead]);

  return (
    <header className="top-bar">
      {repo && (
        <div className="topbar-copy">
          <h2 className="topbar-title">{headLabel}</h2>
          {lead ? <p className="topbar-lead">{lead}</p> : null}
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
            head={sourceRow?.headBranch ?? headBranch}
            base={sourceRow?.baseBranch ?? baseBranch}
            overview={sourceRow?.overview ?? overview}
            metadata={branchMetadata}
            onNeedMetadata={loadBranchMetadata}
            sourceKey={sourceRow?.key ?? null}
            sourceIsLive={sourceIsLive}
            selectedHead={activeRow?.ephemeral ? activeRow.headBranch : null}
            sliceMode={sliceMode}
            loadLane={sourceRow ? loadLane : undefined}
            onApplySlice={(target) => {
              if (!sourceRow) return;
              applyHistorySlice(sourceRow.key, target);
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
