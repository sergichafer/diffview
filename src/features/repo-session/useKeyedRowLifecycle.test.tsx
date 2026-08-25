import { describe, expect, test } from "bun:test";

const { act, useEffect, useReducer, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useKeyedRowLifecycle } = await import("./useKeyedRowLifecycle");

type RowMap = Record<string, { n: number }>;
type Action =
  | { type: "reset-key"; key: string }
  | { type: "evict-key"; key: string }
  | { type: "set"; key: string };

function reducer(map: RowMap, action: Action): RowMap {
  switch (action.type) {
    case "reset-key":
      return { ...map, [action.key]: { n: 0 } };
    case "evict-key": {
      if (!(action.key in map)) return map;
      const next = { ...map };
      delete next[action.key];
      return next;
    }
    case "set":
      return { ...map, [action.key]: { n: 1 } };
  }
}

type Args = {
  activeKey: string | null;
  mergeBaseOid: string;
  openKeys: ReadonlySet<string>;
};

function mountLifecycle(args: Args): {
  getMap: () => RowMap;
  set: (key: string) => void;
  setArgs: (next: Partial<Args>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: RowMap = {};
  let setRow: ((key: string) => void) | null = null;
  let setProps: ((p: Args) => void) | null = null;

  function Harness({ props }: { props: Args }) {
    const [map, dispatch] = useReducer(reducer, {});
    useKeyedRowLifecycle(
      props.activeKey,
      props.mergeBaseOid,
      props.openKeys,
      Object.keys(map),
      dispatch,
    );
    latest = map;
    useEffect(() => {
      setRow = (key: string) => dispatch({ type: "set", key });
    });
    return null;
  }

  function Host({ initial }: { initial: Args }) {
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
    getMap: () => latest,
    set: (key) => {
      act(() => setRow?.(key));
    },
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

const KEY_A = "/repo|main|a";
const KEY_B = "/repo|main|b";

describe("useKeyedRowLifecycle", () => {
  test("evicts a row when its key leaves openKeys", () => {
    const h = mountLifecycle({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });
    h.set(KEY_A);
    h.set(KEY_B);
    expect(KEY_A in h.getMap()).toBe(true);
    expect(KEY_B in h.getMap()).toBe(true);

    h.setArgs({ openKeys: new Set([KEY_B]) });
    expect(KEY_A in h.getMap()).toBe(false);
    expect(KEY_B in h.getMap()).toBe(true);
    h.unmount();
  });

  test("resets the active row when its merge-base stamp changes", () => {
    const h = mountLifecycle({
      activeKey: KEY_A,
      mergeBaseOid: "stamp-1",
      openKeys: new Set([KEY_A]),
    });
    h.set(KEY_A);
    expect(h.getMap()[KEY_A]?.n).toBe(1);

    h.setArgs({ mergeBaseOid: "stamp-2" });
    expect(h.getMap()[KEY_A]?.n).toBe(0);
    h.unmount();
  });

  test("changing the active key does not reset the previous row", () => {
    const h = mountLifecycle({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });
    h.set(KEY_A);
    h.setArgs({ activeKey: KEY_B });
    expect(h.getMap()[KEY_A]?.n).toBe(1);
    h.unmount();
  });
});
