import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useOverlayPresence } = await import("./useOverlayPresence");

type Presence = ReturnType<typeof useOverlayPresence>;

let rafId = 0;
const rafPending = new Map<number, FrameRequestCallback>();

function flushFrames(count = 1) {
  for (let i = 0; i < count; i++) {
    const batch = [...rafPending.values()];
    rafPending.clear();
    act(() => {
      for (const cb of batch) cb(0);
    });
  }
}

function mockOverlayTimeouts() {
  const scheduled: Array<{ id: number; cb: () => void; ms: number }> = [];
  let nextId = 8000;
  const prevWindowSet = window.setTimeout;
  const prevWindowClear = window.clearTimeout;
  const prevGlobalSet = globalThis.setTimeout;
  const prevGlobalClear = globalThis.clearTimeout;
  const setTimeoutMock = (cb: TimerHandler, ms?: number) => {
    const id = ++nextId;
    scheduled.push({ id, cb: cb as () => void, ms: ms ?? 0 });
    return id;
  };
  const clearTimeoutMock = (id: number | undefined) => {
    const i = scheduled.findIndex((t) => t.id === id);
    if (i >= 0) scheduled.splice(i, 1);
  };
  window.setTimeout = setTimeoutMock as typeof window.setTimeout;
  window.clearTimeout = clearTimeoutMock as typeof window.clearTimeout;
  globalThis.setTimeout = setTimeoutMock as typeof globalThis.setTimeout;
  globalThis.clearTimeout = clearTimeoutMock as typeof globalThis.clearTimeout;
  return {
    overlayTimers: () => scheduled.filter((t) => t.ms >= 200),
    restore() {
      window.setTimeout = prevWindowSet;
      window.clearTimeout = prevWindowClear;
      globalThis.setTimeout = prevGlobalSet;
      globalThis.clearTimeout = prevGlobalClear;
    },
  };
}

function mountPresence(visible: boolean, onExited?: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Presence | null = null;
  let setVisible: ((next: boolean) => void) | null = null;

  function Harness({ value }: { value: boolean }) {
    const api = useOverlayPresence(value, onExited);
    latest = api;
    return null;
  }

  function Host({ initial }: { initial: boolean }) {
    const [value, set] = useState(initial);
    useEffect(() => {
      setVisible = set;
    }, []);
    return <Harness value={value} />;
  }

  act(() => {
    root.render(<Host initial={visible} />);
  });

  return {
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
    },
    setVisible: (next: boolean) => {
      act(() => setVisible?.(next));
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useOverlayPresence", () => {
  beforeEach(() => {
    rafId = 0;
    rafPending.clear();
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafPending.set(id, cb);
      return id;
    };
    (globalThis as any).cancelAnimationFrame = (id: number) => {
      rafPending.delete(id);
    };
    (globalThis as any).matchMedia = () => ({
      matches: false,
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
  });

  afterEach(() => {
    rafPending.clear();
  });

  test("open → closing → unmount after opacity transitionend", () => {
    const h = mountPresence(false);
    expect(h.get().mounted).toBe(false);
    expect(h.get().overlayState).toBeUndefined();

    h.setVisible(true);
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBeUndefined();

    flushFrames(2);
    expect(h.get().overlayState).toBe("open");
    expect(h.get().mounted).toBe(true);

    h.setVisible(false);
    expect(h.get().overlayState).toBe("closing");
    expect(h.get().mounted).toBe(true);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "transform" });
    });
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBe("closing");

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(h.get().mounted).toBe(false);
    expect(h.get().overlayState).toBeUndefined();

    h.unmount();
  });

  test("re-open while closing interrupts from the current state", () => {
    const h = mountPresence(true);
    flushFrames(2);
    expect(h.get().overlayState).toBe("open");

    h.setVisible(false);
    expect(h.get().overlayState).toBe("closing");
    expect(h.get().mounted).toBe(true);

    h.setVisible(true);
    expect(h.get().overlayState).toBe("open");
    expect(h.get().mounted).toBe(true);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBe("open");

    h.unmount();
  });

  test("remounts from fully closed when visible becomes true", () => {
    const h = mountPresence(true);
    flushFrames(2);
    expect(h.get().overlayState).toBe("open");

    h.setVisible(false);
    expect(h.get().overlayState).toBe("closing");

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(h.get().mounted).toBe(false);
    expect(h.get().overlayState).toBeUndefined();

    h.setVisible(true);
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBeUndefined();

    flushFrames(2);
    expect(h.get().overlayState).toBe("open");
    expect(h.get().mounted).toBe(true);

    h.unmount();
  });

  test("onExited fires once after opacity, not transform", () => {
    const onExited = mock(() => {});
    const h = mountPresence(true, onExited);
    flushFrames(2);

    h.setVisible(false);
    expect(h.get().overlayState).toBe("closing");

    act(() => {
      h.get().onTransitionEnd({ propertyName: "transform" });
    });
    expect(onExited).not.toHaveBeenCalled();
    expect(h.get().mounted).toBe(true);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(h.get().mounted).toBe(false);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(onExited).toHaveBeenCalledTimes(1);

    h.unmount();
  });

  test("onExited is skipped when re-open interrupts closing", () => {
    const onExited = mock(() => {});
    const h = mountPresence(true, onExited);
    flushFrames(2);

    h.setVisible(false);
    expect(h.get().overlayState).toBe("closing");

    h.setVisible(true);
    expect(h.get().overlayState).toBe("open");
    expect(h.get().mounted).toBe(true);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "opacity" });
    });
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBe("open");
    expect(onExited).not.toHaveBeenCalled();

    h.unmount();
  });

  test("transform transitionend never finish-closes", () => {
    const onExited = mock(() => {});
    const h = mountPresence(true, onExited);
    flushFrames(2);
    h.setVisible(false);

    act(() => {
      h.get().onTransitionEnd({ propertyName: "transform" });
    });
    expect(h.get().mounted).toBe(true);
    expect(h.get().overlayState).toBe("closing");
    expect(onExited).not.toHaveBeenCalled();
    h.unmount();
  });

  test("opacity transitionend from a nested settings-modal still unmounts", () => {
    const onExited = mock(() => {});
    const h = mountPresence(true, onExited);
    flushFrames(2);
    h.setVisible(false);

    const dialog = document.createElement("dialog");
    const modal = document.createElement("div");
    modal.className = "settings-modal";
    dialog.appendChild(modal);

    act(() => {
      h.get().onTransitionEnd({
        propertyName: "opacity",
        target: modal,
        currentTarget: dialog,
      });
    });
    expect(h.get().mounted).toBe(false);
    expect(onExited).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  test("opacity transitionend from a nested compare-graph-panel still unmounts", () => {
    const onExited = mock(() => {});
    const h = mountPresence(true, onExited);
    flushFrames(2);
    h.setVisible(false);

    const dialog = document.createElement("dialog");
    const panel = document.createElement("div");
    panel.className = "compare-graph-panel";
    dialog.appendChild(panel);

    act(() => {
      h.get().onTransitionEnd({
        propertyName: "opacity",
        target: panel,
        currentTarget: dialog,
      });
    });
    expect(h.get().mounted).toBe(false);
    expect(onExited).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  test("finishClose double-invoke in the same tick fires onExited once", () => {
    const onExited = mock(() => {});
    const timers = mockOverlayTimeouts();
    try {
      const h = mountPresence(true, onExited);
      flushFrames(2);
      h.setVisible(false);
      expect(h.get().overlayState).toBe("closing");
      expect(timers.overlayTimers()).toHaveLength(1);
      const pending = timers.overlayTimers();

      act(() => {
        h.get().onTransitionEnd({ propertyName: "opacity" });
        for (const t of pending) t.cb();
      });
      expect(onExited).toHaveBeenCalledTimes(1);
      expect(h.get().mounted).toBe(false);
      h.unmount();
    } finally {
      timers.restore();
    }
  });

  test("close-timeout cleanup on interrupt does not unmount a reopened overlay", () => {
    const onExited = mock(() => {});
    const timers = mockOverlayTimeouts();
    try {
      const h = mountPresence(true, onExited);
      flushFrames(2);
      h.setVisible(false);
      expect(timers.overlayTimers()).toHaveLength(1);
      const leftover = timers.overlayTimers();

      h.setVisible(true);
      expect(h.get().overlayState).toBe("open");
      expect(h.get().mounted).toBe(true);
      expect(timers.overlayTimers()).toHaveLength(0);

      act(() => {
        for (const t of leftover) t.cb();
      });
      expect(h.get().mounted).toBe(true);
      expect(h.get().overlayState).toBe("open");
      expect(onExited).not.toHaveBeenCalled();
      h.unmount();
    } finally {
      timers.restore();
    }
  });
});
