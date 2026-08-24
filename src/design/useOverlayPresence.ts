import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Critically damped overlay settle, 360ms. Keep in sync with overlays.css. */
export const OVERLAY_DURATION_MS = 360;
export const OVERLAY_REDUCED_MOTION_MS = 200;
const CLOSE_TIMEOUT_BUFFER_MS = 80;

export type OverlayVisualState = "open" | "closing";

export type OverlayTransitionEndLike = {
  propertyName: string;
  target?: EventTarget | null;
  currentTarget?: EventTarget | null;
};

function isDialogOverlaySurface(el: Element): boolean {
  return (
    el.classList.contains("compare-sheet") ||
    el.classList.contains("compare-backdrop") ||
    el.classList.contains("settings-modal") ||
    el.classList.contains("settings-dialog-backdrop") ||
    el.classList.contains("compare-graph-panel")
  );
}

export function getOverlayDurationMs(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return OVERLAY_DURATION_MS;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? OVERLAY_REDUCED_MOTION_MS
      : OVERLAY_DURATION_MS;
  } catch {
    return OVERLAY_DURATION_MS;
  }
}

/**
 * Store `--overlay-origin-x/y` for `transform-origin`. Viewport px go on
 * `host`; the surface gets the same point converted into its border box so
 * scale reads as growing from the trigger.
 */
export function applyOverlayOrigin(
  host: HTMLElement,
  trigger: Element | null | undefined,
  surface: HTMLElement = host,
): void {
  let vx = window.innerWidth / 2;
  let vy = window.innerHeight / 2;
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    vx = rect.left + rect.width / 2;
    vy = rect.top + rect.height / 2;
  }

  host.style.setProperty("--overlay-origin-x", `${Math.round(vx)}px`);
  host.style.setProperty("--overlay-origin-y", `${Math.round(vy)}px`);

  if (surface !== host) {
    // transform-origin is in the untransformed border box; getBoundingClientRect
    // includes the enter scale (0.96) and would shift the origin.
    const prevTransform = surface.style.transform;
    surface.style.transform = "none";
    const box = surface.getBoundingClientRect();
    surface.style.setProperty(
      "--overlay-origin-x",
      `${Math.round(vx - box.left)}px`,
    );
    surface.style.setProperty(
      "--overlay-origin-y",
      `${Math.round(vy - box.top)}px`,
    );
    surface.style.transform = prevTransform;
  }
}

/**
 * Keep an overlay mounted through its exit transition. `visible` is the
 * logical open flag; `overlayState` is the CSS visual (`open` / `closing`).
 * Re-opening while `closing` flips back to `open` from the current values.
 * `onExited` fires once when the exit animation finishes (unmount signal).
 */
export function useOverlayPresence(
  visible: boolean,
  onExited?: () => void,
): {
  mounted: boolean;
  overlayState: OverlayVisualState | undefined;
  onTransitionEnd: (event: OverlayTransitionEndLike) => void;
} {
  const [mounted, setMounted] = useState(visible);
  const [state, setState] = useState<OverlayVisualState | null>(null);
  const stateRef = useRef(state);
  const visibleRef = useRef(visible);
  const onExitedRef = useRef(onExited);

  if (visible && !mounted) {
    setMounted(true);
    setState(null);
  }

  useLayoutEffect(() => {
    stateRef.current = state;
    visibleRef.current = visible;
    onExitedRef.current = onExited;
  });

  useLayoutEffect(() => {
    if (visible) {
      if (stateRef.current === "closing") {
        setState("open");
      }
      return;
    }
    if (stateRef.current === "open") {
      setState("closing");
      return;
    }
    if (stateRef.current === null && mounted) {
      setMounted(false);
    }
  }, [visible, mounted]);

  useEffect(() => {
    if (!visible || !mounted || state !== null) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (visibleRef.current && stateRef.current === null) {
          setState("open");
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [visible, mounted, state]);

  const finishClose = useCallback(() => {
    if (visibleRef.current) return;
    if (stateRef.current !== "closing") return;
    stateRef.current = null;
    setMounted(false);
    setState(null);
    onExitedRef.current?.();
  }, []);

  useEffect(() => {
    if (state !== "closing") return;
    const ms = getOverlayDurationMs() + CLOSE_TIMEOUT_BUFFER_MS;
    const t = window.setTimeout(finishClose, ms);
    return () => clearTimeout(t);
  }, [state, finishClose]);

  const onTransitionEnd = useCallback(
    (event: OverlayTransitionEndLike) => {
      if (event.propertyName !== "opacity") return;
      const target = event.target;
      const current = event.currentTarget;
      if (
        target instanceof Element &&
        current instanceof Element &&
        target !== current &&
        !isDialogOverlaySurface(target)
      ) {
        return;
      }
      finishClose();
    },
    [finishClose],
  );

  return {
    mounted,
    overlayState: state ?? undefined,
    onTransitionEnd,
  };
}
