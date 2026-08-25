import { describe, expect, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useLineCommentsState } = await import("./LineCommentsProvider");

type HookApi = ReturnType<typeof useLineCommentsState>;

const KEY_A = "/repo|main|a";
const KEY_B = "/repo|main|b";

type CommentsArgs = {
  activeKey: string | null;
  mergeBaseOid: string;
  openKeys: ReadonlySet<string>;
};

function mountComments(args: CommentsArgs): {
  get: () => HookApi;
  setArgs: (next: Partial<CommentsArgs>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: HookApi | null = null;
  let setProps: ((p: CommentsArgs) => void) | null = null;

  function Harness({ props }: { props: CommentsArgs }) {
    const api = useLineCommentsState(props);
    latest = api;
    return null;
  }

  function Host({ initial }: { initial: CommentsArgs }) {
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
    get: () => {
      if (!latest) throw new Error("hook not mounted");
      return latest;
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

describe("useLineCommentsState", () => {
  test("evicts comments when the active key leaves openKeys", () => {
    const h = mountComments({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });

    act(() => {
      h.get().startDraft("src/a.ts", { start: 1, end: 1, side: "additions" });
    });
    expect(h.get().pathComments["src/a.ts"]?.length).toBe(1);

    h.setArgs({ openKeys: new Set([KEY_B]) });
    expect(Object.keys(h.get().pathComments)).toHaveLength(0);
    h.unmount();
  });

  test("dropping another key does not clear the active comments", () => {
    const h = mountComments({
      activeKey: KEY_A,
      mergeBaseOid: "stamp",
      openKeys: new Set([KEY_A, KEY_B]),
    });

    act(() => {
      h.get().startDraft("src/a.ts", { start: 1, end: 1, side: "additions" });
    });
    expect(h.get().pathComments["src/a.ts"]?.length).toBe(1);

    h.setArgs({ openKeys: new Set([KEY_A]) });
    expect(h.get().pathComments["src/a.ts"]?.length).toBe(1);
    h.unmount();
  });

  test("resets comments when the active merge-base stamp changes", () => {
    const h = mountComments({
      activeKey: KEY_A,
      mergeBaseOid: "stamp-1",
      openKeys: new Set([KEY_A]),
    });

    act(() => {
      h.get().startDraft("src/a.ts", { start: 2, end: 2, side: "additions" });
    });
    expect(h.get().pathComments["src/a.ts"]?.length).toBe(1);

    h.setArgs({ mergeBaseOid: "stamp-2" });
    expect(Object.keys(h.get().pathComments)).toHaveLength(0);
    h.unmount();
  });
});
