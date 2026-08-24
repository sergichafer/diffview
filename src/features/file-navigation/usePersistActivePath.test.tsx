import { describe, expect, mock, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { usePersistActivePath } = await import("./usePersistActivePath");
import type { AppSettings } from "@/shared/types/app";

type PersistArgs = {
  comparisonKey: string | null;
  selectedPath: string | null;
  activePathByComparison: Record<string, string>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

const KEY = "/repo|main|feature";

function mountPersist(args: PersistArgs): {
  setArgs: (next: Partial<PersistArgs>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let setProps: ((p: PersistArgs) => void) | null = null;

  function Harness({ props }: { props: PersistArgs }) {
    usePersistActivePath(props);
    return null;
  }

  function Host({ initial }: { initial: PersistArgs }) {
    const [props, set] = useState(initial);
    useEffect(() => {
      setProps = set;
    }, []);
    return <Harness props={props} />;
  }

  act(() => {
    root.render(<Host initial={args} />);
  });

  return {
    setArgs: (next) => {
      act(() => {
        setProps?.((prev) => ({ ...prev, ...next }));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("usePersistActivePath", () => {
  test("does not update when the selected path is already in the map", () => {
    const update = mock((_patch: Partial<AppSettings>) => Promise.resolve());
    const h = mountPersist({
      comparisonKey: KEY,
      selectedPath: "a.ts",
      activePathByComparison: { [KEY]: "a.ts" },
      update,
    });
    expect(update).not.toHaveBeenCalled();
    h.unmount();
  });

  test("persists once on path change and skips identity rerenders", () => {
    const update = mock((_patch: Partial<AppSettings>) => Promise.resolve());
    const initial = { [KEY]: "a.ts" };
    const h = mountPersist({
      comparisonKey: KEY,
      selectedPath: "a.ts",
      activePathByComparison: initial,
      update,
    });
    expect(update).not.toHaveBeenCalled();

    h.setArgs({ selectedPath: "b.ts" });
    expect(update).toHaveBeenCalledTimes(1);
    const next = update.mock.calls[0]?.[0]?.activePathByComparison;
    expect(next).toEqual({ [KEY]: "b.ts" });
    expect(next).not.toBe(initial);

    h.setArgs({
      selectedPath: "b.ts",
      activePathByComparison: next ?? {},
    });
    expect(update).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  test("same-tick persist guard writes next inside the effect, before update", async () => {
    const src = await Bun.file(
      new URL("./usePersistActivePath.ts", import.meta.url),
    ).text();
    const effectStart = src.indexOf("useEffect(() => {");
    const effectEnd = src.indexOf("}, [comparisonKey, selectedPath]);");
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
    const effect = src.slice(effectStart, effectEnd);
    const writeIdx = effect.indexOf("activePathRef.current = next");
    const updateIdx = effect.indexOf("void updateRef.current");
    expect(writeIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(writeIdx);

    const layoutStart = src.indexOf("useLayoutEffect(() => {");
    const layout = src.slice(layoutStart, effectStart);
    expect(layout).not.toContain("activePathRef.current = next");
  });
});
