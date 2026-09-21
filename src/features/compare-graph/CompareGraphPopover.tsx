import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconButton } from "@/design/IconButton";
import { isTypingTarget } from "@/design/isTypingTarget";
import {
  applyOverlayOrigin,
  useOverlayPresence,
} from "@/design/useOverlayPresence";
import type { BranchMetadata, BranchOverview, HistoryLane as HistoryLaneData } from "@/shared/types/app";
import { GRAPH_WIP_TITLE, WIP_LABEL } from "@/shared/wipCopy";
import { HistoryLane } from "@/features/history/HistoryLane";
import {
  buildHistoryNodes,
  historySliceTarget,
  type HistoryMode,
  type HistorySliceTarget,
} from "@/features/history/historyModel";
import { CompareGraphSvg } from "./CompareGraphSvg";
import {
  comparisonHasWip,
  graphDetail,
  graphTitle,
  graphTopology,
} from "./graphTopology";

interface CompareGraphPopoverProps {
  head: string;
  base: string;
  overview: BranchOverview | null;
  metadata: BranchMetadata[];
  onNeedMetadata?: () => void;
  sourceKey?: string | null;
  sourceIsLive?: boolean;
  selectedHead?: string | null;
  sliceMode?: HistoryMode;
  loadLane?: () => Promise<HistoryLaneData>;
  onApplySlice?: (target: HistorySliceTarget | null) => void;
}

export function CompareGraphPopover({
  head,
  base,
  overview,
  metadata,
  onNeedMetadata,
  sourceKey = null,
  sourceIsLive = false,
  selectedHead = null,
  sliceMode,
  loadLane,
  onApplySlice,
}: CompareGraphPopoverProps) {
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState<HistoryLaneData | null>(null);
  const [mode, setMode] = useState<HistoryMode>(sliceMode ?? "range");
  const sliceSignature = useRef("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef(false);
  const panelId = useId();
  const captionId = useId();

  const presence = useOverlayPresence(open, () => {
    if (restoreFocusRef.current) triggerRef.current?.focus();
    restoreFocusRef.current = false;
  });

  const topology = useMemo(
    () => graphTopology({ head, base, overview, metadata }),
    [head, base, overview, metadata],
  );
  const hasWip = comparisonHasWip(overview, head);
  const nodes = useMemo(
    () => (lane ? buildHistoryNodes(lane, sourceIsLive, base) : []),
    [lane, sourceIsLive, base],
  );

  useEffect(() => {
    if (sliceMode) setMode(sliceMode);
  }, [sliceMode]);

  useEffect(() => {
    if (selectedHead == null) sliceSignature.current = "";
  }, [selectedHead]);

  useEffect(() => {
    setLane(null);
    sliceSignature.current = "";
  }, [loadLane]);

  useEffect(() => {
    if (!open || !loadLane) return;
    let cancelled = false;
    loadLane()
      .then((next) => {
        if (!cancelled) setLane(next);
      })
      .catch(() => {
        if (!cancelled) setLane(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadLane]);

  const pickSlice = useCallback(
    (index: number, nextMode: HistoryMode) => {
      if (!lane || !sourceKey || !onApplySlice) return;
      setMode(nextMode);
      const target = historySliceTarget({
        nodes,
        index,
        mode: nextMode,
        baseBranch: base,
        headOid: lane.headOid,
        mergeBase: lane.mergeBase,
      });
      const signature = target
        ? `${sourceKey}|${target.mode}|${target.baseBranch}|${target.headBranch}`
        : `source:${sourceKey}`;
      if (sliceSignature.current === signature) return;
      sliceSignature.current = signature;
      onApplySlice(target);
    },
    [lane, sourceKey, onApplySlice, nodes, base],
  );

  const close = useCallback((restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close(true);
      return;
    }
    restoreFocusRef.current = false;
    onNeedMetadata?.();
    setOpen(true);
  }, [open, onNeedMetadata, close]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!panel.open) panel.show();
    return () => {
      if (panel.open) panel.close();
    };
  }, [presence.mounted]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const panel = panelRef.current;
    if (!host || !panel) return;
    applyOverlayOrigin(host, triggerRef.current, panel);
  }, [presence.mounted, presence.overlayState]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("dialog:modal")) return;
      event.preventDefault();
      close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  return (
    <div className="compare-graph-anchor">
      <IconButton
        ref={triggerRef}
        name="graph"
        active={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={presence.mounted ? panelId : undefined}
        onClick={toggle}
      />
      {presence.mounted ? (
        <div
          ref={hostRef}
          className="compare-graph overlay-host"
          data-overlay-state={presence.overlayState}
        >
          <dialog
            ref={panelRef}
            id={panelId}
            className={
              lane
                ? "compare-graph-panel overlay-surface is-history"
                : "compare-graph-panel overlay-surface"
            }
            aria-label={lane ? "History" : "Compare graph"}
            aria-describedby={captionId}
            onTransitionEnd={presence.onTransitionEnd}
          >
            {lane ? (
              <HistoryLane
                nodes={nodes}
                mode={mode}
                selectedHead={selectedHead}
                baseBranch={base}
                headOid={lane.headOid}
                mergeBase={lane.mergeBase}
                truncated={lane.truncated}
                nowSeconds={Math.floor(Date.now() / 1000)}
                onMode={setMode}
                onSelect={pickSlice}
                captionId={captionId}
              />
            ) : (
              <>
            <p className="compare-graph-head">Graph</p>
            <CompareGraphSvg topology={topology} hasWip={hasWip} />
            <p id={captionId} className="compare-graph-caption">
              <strong>{graphTitle(topology)}.</strong> {graphDetail(topology)}
            </p>
            <div className="compare-graph-legend">
              <span className="compare-graph-legend-item">
                <span
                  className="compare-graph-swatch compare-graph-swatch-merge"
                  aria-hidden="true"
                />
                merge-base
              </span>
              <span className="compare-graph-legend-item">
                <span
                  className="compare-graph-swatch compare-graph-swatch-ahead"
                  aria-hidden="true"
                />
                ahead
              </span>
              <span className="compare-graph-legend-item">
                <span
                  className="compare-graph-swatch compare-graph-swatch-behind"
                  aria-hidden="true"
                />
                behind
              </span>
              {hasWip ? (
                <span className="compare-graph-legend-item" title={GRAPH_WIP_TITLE}>
                  <span
                    className="compare-graph-swatch compare-graph-swatch-live"
                    aria-hidden="true"
                  />
                  {WIP_LABEL}
                </span>
              ) : null}
            </div>
              </>
            )}
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
