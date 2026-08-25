import { useMemo, useState } from "react";
import { BranchComparePalette } from "@/features/branch-compare/BranchComparePalette";
import { computeAppliedStat } from "@/features/branch-compare/compareStat";
import { CompareGraphPopover } from "@/features/compare-graph/CompareGraphPopover";
import { IconButton } from "@/design/IconButton";
import type {
  BranchMetadata,
  BranchOverview,
  FileDiffResult,
} from "@/shared/types/app";

interface ReviewTopBarProps {
  repoName: string;
  headBranch: string;
  baseBranch: string;
  branches: string[];
  metadata: BranchMetadata[];
  overview: BranchOverview;
  fileDiffs: FileDiffResult[];
  paletteOpen: boolean;
  onPaletteOpenChange: (open: boolean) => void;
}

export function ReviewTopBar({
  repoName,
  headBranch,
  baseBranch,
  branches,
  metadata,
  overview,
  fileDiffs,
  paletteOpen,
  onPaletteOpenChange,
}: ReviewTopBarProps) {
  const [refreshBusy, setRefreshBusy] = useState(false);
  const stat = useMemo(
    () => computeAppliedStat(overview.files.length, fileDiffs),
    [overview.files.length, fileDiffs],
  );
  const headLabel = headBranch || "Working tree";
  const lead = `${repoName} · against ${baseBranch}`;

  return (
    <header className="top-bar">
      <div className="topbar-copy">
        <h2 className="topbar-title">{headLabel}</h2>
        <p className="topbar-lead">{lead}</p>
      </div>
      <div className="topbar-zone topbar-zone-right icon-toolbar">
        <BranchComparePalette
          head={headBranch}
          base={baseBranch}
          branches={branches}
          metadata={metadata}
          metadataLoading={false}
          stat={stat}
          open={paletteOpen}
          onOpenChange={onPaletteOpenChange}
          onChange={() => {}}
          onOpen={() => {}}
        />
        <IconButton
          name="refresh"
          busy={refreshBusy}
          title={refreshBusy ? "Refreshing…" : "Refresh"}
          onClick={() => {
            setRefreshBusy(true);
            window.setTimeout(() => setRefreshBusy(false), 720);
          }}
        />
        <CompareGraphPopover
          head={headBranch}
          base={baseBranch}
          overview={overview}
          metadata={metadata}
        />
        <IconButton name="settings" />
      </div>
    </header>
  );
}
