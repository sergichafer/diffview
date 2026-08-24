import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconButton } from "@/design/IconButton";
import {
  applyOverlayOrigin,
  useOverlayPresence,
} from "@/design/useOverlayPresence";
import type { BranchMetadata, BranchOverview } from "@/shared/types/app";
import { CompareGraphSvg } from "./CompareGraphSvg";
import { graphTopology } from "./graphTopology";

interface CompareGraphPopoverProps {
  head: string;
  base: string;
  overview: BranchOverview | null;
  metadata: BranchMetadata[];
}

export function CompareGraphPopover({
  head,
  base,
  overview,
  metadata,
}: CompareGraphPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const presence = useOverlayPresence(open, () => {
    triggerRef.current?.focus();
  });

  const topology = useMemo(
    () => graphTopology({ head, base, overview, metadata }),
    [head, base, overview, metadata],
  );

  const toggle = useCallback(() => {
    setOpen((value) => !value);
  }, []);

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
      event.preventDefault();
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="compare-graph-anchor">
      <IconButton
        ref={triggerRef}
        name="graph"
        active={open}
        expanded={open}
        onClick={toggle}
      />
      {presence.mounted ? (
        <div
          ref={hostRef}
          className="compare-graph"
          data-overlay-state={presence.overlayState}
        >
          <div
            ref={panelRef}
            className="compare-graph-panel"
            role="dialog"
            aria-label="Compare graph"
            tabIndex={-1}
            onTransitionEnd={presence.onTransitionEnd}
          >
            <p className="compare-graph-head">Graph</p>
            <CompareGraphSvg topology={topology} />
            <p className="compare-graph-caption">
              <strong>{topology.title}.</strong> {topology.detail}
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
              {topology.isLive ? (
                <span className="compare-graph-legend-item">
                  <span
                    className="compare-graph-swatch compare-graph-swatch-live"
                    aria-hidden="true"
                  />
                  working tree
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
