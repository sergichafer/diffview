import { describe, expect, mock, test } from "bun:test";
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

mock.module("@/shared/tauri/api", () => ({
  api: {
    getComparisonStamp: (_repo: string, _base: string, head: string) =>
      new Promise<ComparisonStamp>((resolve) => {
        pendingStamps.push({ head, resolve });
      }),
    getBranchOverview: (_repo: string, base: string, head: string) => {
      overviewHeads.push(head);
      return Promise.resolve(overview(base, head));
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

async function resolveStamps() {
  const batch = pendingStamps.splice(0);
  await act(async () => {
    for (const { head, resolve } of batch) {
      resolve({ mergeBase: "base0", headOid: head, isLive: false });
    }
  });
  await flush();
}

describe("useRepoSessionState", () => {
  test("quick history scrubs load only the final slice", async () => {
    const opened = { repo, branches: ["main", "feature"] };
    const settings = { ...DEFAULT_SETTINGS, launchMode: "empty" as const };
    const update = () => Promise.resolve();
    let session: SessionApi | null = null;

    function Harness() {
      session = useRepoSessionState(settings, update, opened, [opened]);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });
    await resolveStamps();
    expect(overviewHeads).toEqual(["feature"]);
    overviewHeads.length = 0;

    for (const oid of ["c5", "c4", "c3", "c2", "c1"]) {
      act(() => {
        session!.applyHistorySlice(sourceKey, through(oid));
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
    const slice = session!.comparisons[sliceComparisonKey(sourceKey)];
    expect(slice?.overview?.headOid).toBe("c1");
    expect(slice?.outdated).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
