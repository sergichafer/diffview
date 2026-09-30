import { describe, expect, test } from "bun:test";

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useLineCommentsState } = await import("./LineCommentsProvider");
const { makeComparisonKey } = await import(
  "@/features/branch-compare/comparisonKey"
);
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");
const { buildInitialState } = await import(
  "@/features/repo-session/workspaceTreeCodec"
);
const { activeReviewStampFromState, sessionReducer } = await import(
  "@/features/repo-session/sessionReducer"
);

type SessionState = ReturnType<typeof buildInitialState>;

type HookApi = ReturnType<typeof useLineCommentsState>;

const KEY_A = "/repo|main|a";
const KEY_B = "/repo|main|b";

type CommentsArgs = {
  activeKey: string | null;
  reviewStamp: string;
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
      reviewStamp: "stamp",
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
      reviewStamp: "stamp",
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
      reviewStamp: "stamp-1",
      openKeys: new Set([KEY_A]),
    });

    act(() => {
      h.get().startDraft("src/a.ts", { start: 2, end: 2, side: "additions" });
    });
    expect(h.get().pathComments["src/a.ts"]?.length).toBe(1);

    h.setArgs({ reviewStamp: "stamp-2" });
    expect(Object.keys(h.get().pathComments)).toHaveLength(0);
    h.unmount();
  });

  test("scrubbing a history slice resets its comments under one merge-base", () => {
    const repo = {
      path: "/repos/demo",
      name: "demo",
      headBranch: "feature",
      defaultBase: "main",
    };
    const opened = { repo, branches: ["main", "feature"] };
    const sourceKey = makeComparisonKey(repo.path, "main", "feature");
    const throughCommit = (state: SessionState, oid: string) => {
      const sliced = sessionReducer(state, {
        type: "set-history-slice",
        workspaceId: repo.path,
        sourceKey,
        slice: {
          sourceBase: "main",
          sourceHead: "feature",
          specBase: "main",
          specHead: oid,
          kind: "range",
          label: oid,
          short: oid,
          detail: `Through ${oid}.`,
          baseLabel: "main",
        },
      });
      return sessionReducer(sliced, {
        type: "comparison-overview",
        key: sliced.activeKey!,
        overview: {
          repoPath: repo.path,
          currentBranch: "feature",
          baseBranch: "main",
          mergeBase: "base0",
          headOid: oid,
          isLive: false,
          files: [{ path: "a.ts", badges: ["committed"], isBinary: false }],
        },
      });
    };
    const argsOf = (state: SessionState): CommentsArgs => ({
      activeKey: state.activeKey,
      reviewStamp: activeReviewStampFromState(state),
      openKeys: new Set(Object.keys(state.comparisons)),
    });

    const initial = buildInitialState(opened, [opened], DEFAULT_SETTINGS);
    const c3 = throughCommit(initial, "c3");
    const h = mountComments(argsOf(c3));
    act(() => {
      h.get().startDraft("a.ts", { start: 42, end: 42, side: "additions" });
    });
    expect(h.get().pathComments["a.ts"]?.length).toBe(1);

    const c1 = throughCommit(c3, "c1");
    expect(c1.activeKey).toBe(c3.activeKey);
    h.setArgs(argsOf(c1));
    expect(Object.keys(h.get().pathComments)).toHaveLength(0);
    h.unmount();
  });
});
