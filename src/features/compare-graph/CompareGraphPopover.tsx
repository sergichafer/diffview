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

  const presence = useOverlayPresence(open, () => {
    if (restoreFocusRef.current) triggerRef.current?.focus();
    restoreFocusRef.current = false;
  });

  const topology = useMemo(
    () => graphTopology({ head, base, overview, metadata }),
    [head, base, overview, metadata],
  );

  const closeFromTrigger = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      restoreFocusRef.current = true;
      setOpen(false);
      return;
    }
    restoreFocusRef.current = false;
    onNeedMetadata?.();
    setOpen(true);
  }, [open, onNeedMetadata]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!panel.open) {
      try {
        panel.show();
      } catch {
        panel.setAttribute("open", "");
      }
    }
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
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select, [contenteditable='true']") ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      restoreFocusRef.current = true;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      restoreFocusRef.current = false;
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
          <dialog
            ref={panelRef}
            className="compare-graph-panel"
            aria-label="Compare graph"
            onCancel={(event) => {
              event.preventDefault();
              if (open) closeFromTrigger();
            }}
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
                  Working tree
                </span>
              ) : null}
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
