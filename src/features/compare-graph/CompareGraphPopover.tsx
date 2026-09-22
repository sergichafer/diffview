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
import { HistoryLane } from "@/features/history/HistoryLane";
import {
  buildHistoryNodes,
  historySliceTarget,
  type HistoryMode,
  type HistorySlice,
} from "@/features/history/historyModel";
import { useHistoryLane } from "@/features/history/useHistoryLane";

interface CompareGraphPopoverProps {
  repoPath: string;
  sourceBase: string;
  sourceHead: string;
  sourceIsLive: boolean;
  selectedHead?: string | null;
  mode?: HistoryMode;
  onSlice: (slice: HistorySlice | null) => void;
}

export function CompareGraphPopover({
  repoPath,
  sourceBase,
  sourceHead,
  sourceIsLive,
  selectedHead = null,
  mode = "range",
  onSlice,
}: CompareGraphPopoverProps) {
  const [open, setOpen] = useState(false);
  const { lane, status } = useHistoryLane(repoPath, sourceBase, sourceHead, open);
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

  const nodes = useMemo(
    () => (lane ? buildHistoryNodes(lane, sourceIsLive, sourceBase) : []),
    [lane, sourceIsLive, sourceBase],
  );

  const onSelect = useCallback(
    (index: number, nextMode: HistoryMode) => {
      if (!lane) return;
      onSlice(
        historySliceTarget({
          nodes,
          index,
          mode: nextMode,
          sourceBase,
          sourceHead,
          headOid: lane.headOid,
          mergeBase: lane.mergeBase,
        }),
      );
    },
    [lane, nodes, onSlice, sourceBase, sourceHead],
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
    setOpen(true);
  }, [open, close]);

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
            className="compare-graph-panel overlay-surface is-history"
            aria-label="History"
            aria-describedby={captionId}
            onTransitionEnd={presence.onTransitionEnd}
          >
            {status === "ready" && lane ? (
              <HistoryLane
                nodes={nodes}
                mode={mode}
                selectedHead={selectedHead}
                sourceBase={sourceBase}
                sourceHead={sourceHead}
                headOid={lane.headOid}
                mergeBase={lane.mergeBase}
                truncated={lane.truncated}
                nowSeconds={Math.floor(Date.now() / 1000)}
                onSelect={onSelect}
                captionId={captionId}
              />
            ) : status === "error" ? (
              <>
                <p className="compare-graph-head">History</p>
                <p id={captionId} className="history-status" role="alert">
                  Could not load history.
                </p>
              </>
            ) : (
              <>
                <p className="compare-graph-head">History</p>
                <p id={captionId} className="history-status" role="status">
                  Loading history.
                </p>
              </>
            )}
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
