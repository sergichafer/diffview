import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampSplitterWidth,
  rubberbandedWidth,
  SPLITTER_MAX_WIDTH,
  SPLITTER_MIN_WIDTH,
  SPLITTER_STEP,
} from "./splitter";

export interface UseSplitResizeOptions {
  minWidth?: number;
  maxWidth?: number;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DEFAULT_SPLITTER_DIMENSION = Math.max(
  SPLITTER_MAX_WIDTH - SPLITTER_MIN_WIDTH,
  1,
);

export function useSplitResize(
  initialWidth: number,
  onPersist: (width: number) => void,
  options: UseSplitResizeOptions = {},
) {
  const minWidth = options.minWidth ?? SPLITTER_MIN_WIDTH;
  const maxWidth = options.maxWidth ?? SPLITTER_MAX_WIDTH;

  const [splitWidth, setSplitWidth] = useState(initialWidth);
  const [prevInitialWidth, setPrevInitialWidth] = useState(initialWidth);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const resizing = useRef(false);
  const dragOriginLeft = useRef(0);
  const dimensionRef = useRef(DEFAULT_SPLITTER_DIMENSION);
  const splitWidthRef = useRef(splitWidth);
  const pendingClampRef = useRef<number | null>(null);
  const minRef = useRef(minWidth);
  const maxRef = useRef(maxWidth);
  const persistRef = useRef(onPersist);

  if (initialWidth !== prevInitialWidth) {
    setPrevInitialWidth(initialWidth);
    if (!resizing.current && pendingClampRef.current == null) {
      setSplitWidth(initialWidth);
    }
  }

  useLayoutEffect(() => {
    minRef.current = minWidth;
    maxRef.current = maxWidth;
    persistRef.current = onPersist;
    splitWidthRef.current = splitWidth;
  });

  useLayoutEffect(() => {
    const pending = pendingClampRef.current;
    if (pending == null || !settling) return;
    pendingClampRef.current = null;
    splitWidthRef.current = pending;
    setSplitWidth(pending);
    persistRef.current(pending);
  }, [settling]);

  useEffect(() => {
    if (!settling) return;
    const id = window.setTimeout(() => setSettling(false), 320);
    return () => window.clearTimeout(id);
  }, [settling]);

  const persistSplitWidth = useCallback((width: number) => {
    const clamped = clampSplitterWidth(width, minRef.current, maxRef.current);
    setSplitWidth(clamped);
    persistRef.current(clamped);
  }, []);

  const onSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const splitter = event.currentTarget;
      const panel = splitter.previousElementSibling as HTMLElement | null;
      splitter.setPointerCapture(event.pointerId);
      resizing.current = true;
      pendingClampRef.current = null;
      const panelBox = panel?.getBoundingClientRect();
      dragOriginLeft.current = panelBox?.left ?? 0;
      const presented = panelBox?.width ?? 0;
      if (presented > 0) {
        splitWidthRef.current = presented;
        setSplitWidth(presented);
      }
      dimensionRef.current =
        presented > 0 ? presented : Math.max(maxRef.current - minRef.current, 1);
      setDragging(true);
      setSettling(false);

      const reducedMotion = prefersReducedMotion();

      const onMove = (e: PointerEvent) => {
        if (!resizing.current) return;
        const raw = e.clientX - dragOriginLeft.current;
        const next = reducedMotion
          ? clampSplitterWidth(raw, minRef.current, maxRef.current)
          : rubberbandedWidth(
              raw,
              minRef.current,
              maxRef.current,
              dimensionRef.current,
            );
        splitWidthRef.current = next;
        setSplitWidth(next);
      };

      const onUp = () => {
        if (!resizing.current) return;
        resizing.current = false;
        splitter.removeEventListener("pointermove", onMove);
        splitter.removeEventListener("pointerup", onUp);
        splitter.removeEventListener("pointercancel", onUp);
        splitter.removeEventListener("lostpointercapture", onUp);
        const clamped = clampSplitterWidth(
          splitWidthRef.current,
          minRef.current,
          maxRef.current,
        );
        const overshot = !reducedMotion && clamped !== splitWidthRef.current;
        setDragging(false);
        if (overshot) {
          pendingClampRef.current = clamped;
          setSettling(true);
        } else {
          splitWidthRef.current = clamped;
          setSplitWidth(clamped);
          persistRef.current(clamped);
        }
      };

      splitter.addEventListener("pointermove", onMove);
      splitter.addEventListener("pointerup", onUp);
      splitter.addEventListener("pointercancel", onUp);
      splitter.addEventListener("lostpointercapture", onUp);
    },
    [],
  );

  const onSplitterKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      let next = splitWidth;
      switch (e.key) {
        case "ArrowLeft":
          next -= SPLITTER_STEP;
          break;
        case "ArrowRight":
          next += SPLITTER_STEP;
          break;
        case "Home":
          next = minRef.current;
          break;
        case "End":
          next = maxRef.current;
          break;
        default:
          return;
      }
      e.preventDefault();
      persistSplitWidth(next);
    },
    [persistSplitWidth, splitWidth],
  );

  return {
    splitWidth,
    dragging,
    settling,
    onSplitterPointerDown,
    onSplitterKeyDown,
  };
}
