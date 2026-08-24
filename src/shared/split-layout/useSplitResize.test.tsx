const ElProto = (globalThis as any).HTMLElement?.prototype;
if (ElProto) {
  if (typeof ElProto.setPointerCapture !== "function") {
    ElProto.setPointerCapture = function setPointerCapture() {};
  }
  if (typeof ElProto.releasePointerCapture !== "function") {
    ElProto.releasePointerCapture = function releasePointerCapture() {};
  }
}

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useSplitResize } = await import("./useSplitResize");
const {
  rubberbandedWidth,
  SPLITTER_MAX_WIDTH,
  SPLITTER_MIN_WIDTH,
} = await import("./splitter");

type HookApi = ReturnType<typeof useSplitResize>;

type SplitArgs = {
  initialWidth: number;
  onPersist: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
};

function mockMatchMedia(reducedMotion: boolean) {
  const impl = () => ({
    matches: reducedMotion,
    media: "",
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    onchange: null,
  });
  (globalThis as any).matchMedia = impl;
  (window as typeof window & { matchMedia: typeof impl }).matchMedia = impl;
}

function mountSplit(args: SplitArgs): {
  get: () => HookApi;
  setArgs: (next: Partial<SplitArgs>) => void;
  panel: HTMLElement;
  splitter: HTMLButtonElement;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: HookApi | null = null;
  let setProps: ((p: SplitArgs) => void) | null = null;

  function Harness({ props }: { props: SplitArgs }) {
    const api = useSplitResize(props.initialWidth, props.onPersist, {
      minWidth: props.minWidth,
      maxWidth: props.maxWidth,
    });
    latest = api;
    return (
      <>
        <div className="split-panel" />
        <button
          type="button"
          className="split-handle"
          onPointerDown={api.onSplitterPointerDown}
          onKeyDown={api.onSplitterKeyDown}
        />
      </>
    );
  }

  function Host({ initial }: { initial: SplitArgs }) {
    const [props, set] = useState(initial);
    useEffect(() => {
      setProps = set;
    }, []);
    return <Harness props={props} />;
  }

  act(() => {
    root.render(<Host initial={args} />);
  });

  const panel = container.querySelector(".split-panel") as HTMLElement;
  const splitter = container.querySelector(".split-handle") as HTMLButtonElement;
  panel.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: args.initialWidth,
      bottom: 400,
      width: args.initialWidth,
      height: 400,
      toJSON() {
        return {};
      },
    }) as DOMRect;

  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    setArgs: (next) => {
      act(() => {
        setProps?.((prev) => ({ ...prev, ...next }));
      });
    },
    panel,
    splitter,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: { clientX: number; pointerId?: number; button?: number },
) {
  const EventCtor = (window as typeof window & { PointerEvent: typeof PointerEvent })
    .PointerEvent;
  const event = new EventCtor(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("useSplitResize", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  test("End after a smaller max persist uses the latest max", () => {
    const persist = mock((_width: number) => {});
    const h = mountSplit({
      initialWidth: 280,
      onPersist: persist,
      minWidth: SPLITTER_MIN_WIDTH,
      maxWidth: SPLITTER_MAX_WIDTH,
    });

    h.setArgs({ maxWidth: 360 });
    act(() => {
      const EventCtor = (
        window as typeof window & { KeyboardEvent: typeof KeyboardEvent }
      ).KeyboardEvent;
      h.splitter.dispatchEvent(
        new EventCtor("keydown", { key: "End", bubbles: true }),
      );
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(360);
    expect(h.get().splitWidth).toBe(360);
    h.unmount();
  });

  test("rubberband settle persists the clamped max with the latest callback", () => {
    const persistA = mock((_width: number) => {});
    const persistB = mock((_width: number) => {});
    const maxWidth = SPLITTER_MAX_WIDTH;
    const h = mountSplit({
      initialWidth: 280,
      onPersist: persistA,
      minWidth: SPLITTER_MIN_WIDTH,
      maxWidth,
    });

    dispatchPointer(h.splitter, "pointerdown", { clientX: 280, button: 0 });
    dispatchPointer(h.splitter, "pointermove", { clientX: 900 });
    expect(h.get().splitWidth).toBeGreaterThan(maxWidth);
    expect(h.get().dragging).toBe(true);
    expect(persistA).not.toHaveBeenCalled();

    h.setArgs({ onPersist: persistB });

    dispatchPointer(h.splitter, "pointerup", { clientX: 900 });
    expect(h.get().settling).toBe(true);
    expect(h.get().splitWidth).toBe(maxWidth);
    expect(persistB).toHaveBeenCalledTimes(1);
    expect(persistB).toHaveBeenCalledWith(maxWidth);
    expect(persistA).not.toHaveBeenCalled();
    h.unmount();
  });

  test("replacing max during drag clamps persist to the latest max", () => {
    const persist = mock((_width: number) => {});
    const h = mountSplit({
      initialWidth: 280,
      onPersist: persist,
      minWidth: SPLITTER_MIN_WIDTH,
      maxWidth: SPLITTER_MAX_WIDTH,
    });

    dispatchPointer(h.splitter, "pointerdown", { clientX: 280, button: 0 });
    dispatchPointer(h.splitter, "pointermove", { clientX: 900 });
    expect(h.get().splitWidth).toBeGreaterThan(SPLITTER_MAX_WIDTH);

    h.setArgs({ maxWidth: 360 });
    dispatchPointer(h.splitter, "pointerup", { clientX: 900 });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(360);
    expect(h.get().splitWidth).toBe(360);
    h.unmount();
  });

  test("dimensionRef from pointer-down is not reset on the next move", () => {
    const persist = mock((_width: number) => {});
    const h = mountSplit({
      initialWidth: 280,
      onPersist: persist,
      minWidth: SPLITTER_MIN_WIDTH,
      maxWidth: SPLITTER_MAX_WIDTH,
    });

    dispatchPointer(h.splitter, "pointerdown", { clientX: 280, button: 0 });
    dispatchPointer(h.splitter, "pointermove", { clientX: 900 });
    const live = h.get().splitWidth;
    const presented = rubberbandedWidth(
      900,
      SPLITTER_MIN_WIDTH,
      SPLITTER_MAX_WIDTH,
      280,
    );
    const defaultDimension = rubberbandedWidth(
      900,
      SPLITTER_MIN_WIDTH,
      SPLITTER_MAX_WIDTH,
      SPLITTER_MAX_WIDTH - SPLITTER_MIN_WIDTH,
    );
    expect(live).toBe(presented);
    expect(live).not.toBe(defaultDimension);

    dispatchPointer(h.splitter, "pointermove", { clientX: 900 });
    expect(h.get().splitWidth).toBe(live);
    h.unmount();
  });

  test("settling layout persist uses the callback from that render", () => {
    const persistA = mock((_width: number) => {});
    const persistB = mock((_width: number) => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: HookApi | null = null;
    let splitter: HTMLButtonElement | null = null;

    function Harness() {
      const [gen, setGen] = useState(0);
      const persist = gen === 0 ? persistA : persistB;
      const api = useSplitResize(280, persist, {
        minWidth: SPLITTER_MIN_WIDTH,
        maxWidth: SPLITTER_MAX_WIDTH,
      });
      latest = api;
      if (api.settling && gen === 0) {
        setGen(1);
      }
      return (
        <>
          <div className="split-panel" />
          <button
            type="button"
            className="split-handle"
            onPointerDown={api.onSplitterPointerDown}
            onKeyDown={api.onSplitterKeyDown}
          />
        </>
      );
    }

    act(() => {
      root.render(<Harness />);
    });
    const panel = container.querySelector(".split-panel") as HTMLElement;
    splitter = container.querySelector(".split-handle") as HTMLButtonElement;
    panel.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 280,
        bottom: 400,
        width: 280,
        height: 400,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    dispatchPointer(splitter, "pointerdown", { clientX: 280, button: 0 });
    dispatchPointer(splitter, "pointermove", { clientX: 900 });
    expect(latest?.splitWidth).toBeGreaterThan(SPLITTER_MAX_WIDTH);
    dispatchPointer(splitter, "pointerup", { clientX: 900 });

    expect(persistB).toHaveBeenCalledTimes(1);
    expect(persistB).toHaveBeenCalledWith(SPLITTER_MAX_WIDTH);
    expect(persistA).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  test("reduced-motion drag does not overshoot", () => {
    mockMatchMedia(true);
    const persist = mock((_width: number) => {});
    const maxWidth = SPLITTER_MAX_WIDTH;
    const h = mountSplit({
      initialWidth: 280,
      onPersist: persist,
      minWidth: SPLITTER_MIN_WIDTH,
      maxWidth,
    });

    dispatchPointer(h.splitter, "pointerdown", { clientX: 280, button: 0 });
    dispatchPointer(h.splitter, "pointermove", { clientX: 900 });
    expect(h.get().splitWidth).toBe(maxWidth);
    expect(h.get().splitWidth).not.toBeGreaterThan(maxWidth);

    dispatchPointer(h.splitter, "pointerup", { clientX: 900 });
    expect(h.get().settling).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(maxWidth);
    h.unmount();
  });
});
