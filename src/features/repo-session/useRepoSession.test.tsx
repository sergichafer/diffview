import { afterEach, describe, expect, mock, test } from "bun:test";
import type {
  BranchOverview,
  ComparisonStamp,
  RepoInfo,
} from "@/shared/types/app";
import type { HistorySlice } from "@/features/history/historyModel";

type PendingStamp = {
  head: string;
  resolve: (stamp: ComparisonStamp) => void;
};

const pendingStamps: PendingStamp[] = [];
const overviewHeads: string[] = [];
let overviewGate: Promise<void> | null = null;

const repo: RepoInfo = {
  path: "/repos/demo",
  name: "demo",
  headBranch: "feature",
  defaultBase: "main",
};

function overview(base: string, head: string): BranchOverview {
  return {
    repoPath: repo.path,
    currentBranch: "feature",
    baseBranch: base,
    mergeBase: "base0",
    headOid: head,
    isLive: false,
    files: [],
  };
}

const opened = { repo, branches: ["main", "feature"] };

mock.module("@/shared/tauri/api", () => ({
  api: {
    openRepository: () => Promise.resolve(opened),
    getComparisonStamp: (_repo: string, _base: string, head: string) =>
      new Promise<ComparisonStamp>((resolve) => {
        pendingStamps.push({ head, resolve });
      }),
    getBranchOverview: async (_repo: string, base: string, head: string) => {
      overviewHeads.push(head);
      if (overviewGate) await overviewGate;
      return overview(base, head);
    },
    getBranchFileDiffs: () => Promise.resolve([]),
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");
const { makeComparisonKey, sliceComparisonKey } = await import(
  "@/features/branch-compare/comparisonKey"
);
const { useRepoSessionState } = await import("./useRepoSession");

type SessionApi = ReturnType<typeof useRepoSessionState>;

const sourceKey = makeComparisonKey(repo.path, "main", "feature");

function through(oid: string): HistorySlice {
  return {
    sourceBase: "main",
    sourceHead: "feature",
    specBase: "main",
    specHead: oid,
    kind: "range",
    label: oid,
    short: oid,
    detail: `Through ${oid}.`,
    baseLabel: "main",
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function resolveStamps(headOid?: (head: string) => string) {
  const batch = pendingStamps.splice(0);
  await act(async () => {
    for (const { head, resolve } of batch) {
      resolve({
        mergeBase: "base0",
        headOid: headOid ? headOid(head) : head,
        isLive: false,
      });
    }
  });
  await flush();
}

/** Holds overview responses so renders between the stamp and the load are observable. */
function holdOverviews() {
  let release = () => {};
  overviewGate = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    overviewGate = null;
    await act(async () => release());
    await flush();
  };
}

let unmountSession: (() => void) | null = null;

afterEach(() => {
  unmountSession?.();
  unmountSession = null;
});

function renderSession() {
  const settings = { ...DEFAULT_SETTINGS, launchMode: "empty" as const };
  const update = () => Promise.resolve();
  const outdatedSeen: boolean[] = [];
  let session: SessionApi | null = null;

  function Harness() {
    session = useRepoSessionState(settings, update, opened, [opened]);
    outdatedSeen.push(session.comparisons[sourceKey]?.outdated ?? false);
    return null;
  }

  pendingStamps.length = 0;
  overviewHeads.length = 0;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
  unmountSession = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { session: () => session!, outdatedSeen };
}

describe("useRepoSessionState", () => {
  test("quick history scrubs load only the final slice", async () => {
    const { session } = renderSession();
    await resolveStamps();
    expect(overviewHeads).toEqual(["feature"]);
    overviewHeads.length = 0;

    for (const oid of ["c5", "c4", "c3", "c2", "c1"]) {
      act(() => {
        session().applyHistorySlice(sourceKey, through(oid));
      });
    }
    expect(pendingStamps.map((entry) => entry.head)).toEqual([
      "c5",
      "c4",
      "c3",
      "c2",
      "c1",
    ]);

    await resolveStamps();
    expect(overviewHeads).toEqual(["c1"]);
    const slice = session().comparisons[sliceComparisonKey(sourceKey)];
    expect(slice?.overview?.headOid).toBe("c1");
    expect(slice?.outdated).toBe(false);
  });

  test("first activation of a cold row loads once without marking it outdated", async () => {
    const { session, outdatedSeen } = renderSession();
    expect(session().comparisons[sourceKey]?.residency).toBe("cold");

    const releaseOverviews = holdOverviews();
    await resolveStamps();
    await releaseOverviews();

    expect(overviewHeads).toEqual(["feature"]);
    expect(outdatedSeen).not.toContain(true);
    expect(session().comparisons[sourceKey]?.headOid).toBe("feature");
  });

  test("focus revalidation leaves a never-loaded row unmarked", async () => {
    const { outdatedSeen } = renderSession();
    expect(pendingStamps).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    const focusStamp = pendingStamps.splice(1);
    expect(focusStamp).toHaveLength(1);
    await act(async () => {
      focusStamp[0]!.resolve({
        mergeBase: "base0",
        headOid: "feature",
        isLive: false,
      });
    });
    await flush();
    expect(outdatedSeen).not.toContain(true);

    await resolveStamps();
    expect(outdatedSeen).not.toContain(true);
  });

  test("a loaded row whose stamp moved is marked outdated and reloads", async () => {
    const { session, outdatedSeen } = renderSession();
    await resolveStamps();
    expect(overviewHeads).toEqual(["feature"]);
    overviewHeads.length = 0;
    outdatedSeen.length = 0;

    await act(async () => {
      session().activateComparison(sourceKey);
    });
    await flush();
    const releaseOverviews = holdOverviews();
    await resolveStamps(() => "moved");
    await releaseOverviews();

    expect(outdatedSeen).toContain(true);
    expect(overviewHeads).toEqual(["feature"]);
    expect(session().comparisons[sourceKey]?.outdated).toBe(false);
  });

  test("focus revalidation marks a loaded row outdated when its stamp moved", async () => {
    const { session } = renderSession();
    await resolveStamps();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await resolveStamps(() => "moved");

    expect(session().comparisons[sourceKey]?.outdated).toBe(true);
  });
});
