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
import type { BranchMetadata, BranchOverview } from "@/shared/types/app";
import { WIP_LABEL, WIP_TITLE } from "@/shared/wipCopy";
import { CompareGraphSvg } from "./CompareGraphSvg";
import {
  comparisonIsLive,
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
}

export function CompareGraphPopover({
  head,
  base,
  overview,
  metadata,
  onNeedMetadata,
}: CompareGraphPopoverProps) {
  const [open, setOpen] = useState(false);
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
  const isLive = comparisonIsLive(overview, head);

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
        expanded={open}
        controls={presence.mounted ? panelId : undefined}
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
            className="compare-graph-panel overlay-surface"
            aria-label="Compare graph"
            aria-describedby={captionId}
            onTransitionEnd={presence.onTransitionEnd}
          >
            <p className="compare-graph-head">Graph</p>
            <CompareGraphSvg topology={topology} isLive={isLive} />
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
              {isLive ? (
                <span className="compare-graph-legend-item" title={WIP_TITLE}>
                  <span
                    className="compare-graph-swatch compare-graph-swatch-live"
                    aria-hidden="true"
                  />
                  {WIP_LABEL}
                </span>
              ) : null}
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
