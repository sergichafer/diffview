import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  AppSettings,
  BranchOverview,
  OpenRepoResult,
  RemoteOpenResult,
  RepoInfo,
} from "@/shared/types/app";

const clone: RepoInfo = {
  path: "/cache/remotes/github.com~sergichafer~diffview.git/",
  name: "sergichafer/diffview",
  headBranch: "main",
  defaultBase: "main",
  remoteUrl: "https://github.com/sergichafer/diffview",
};

const opened: OpenRepoResult = {
  repo: clone,
  branches: ["main", "pr/31", "release"],
};

const calls: string[] = [];
let remoteResult: (url: string) => Promise<RemoteOpenResult> = async () => ({
  opened,
  review: { baseBranch: "release", headBranch: "pr/31" },
});
let fetchResult: () => Promise<OpenRepoResult> = async () => opened;

function localRepo(path: string): OpenRepoResult {
  return {
    repo: { path, name: path, headBranch: "main", defaultBase: "main" },
    branches: ["main"],
  };
}

/** Clone result for `https://github.com/<owner>/<repo>`. */
function remoteRepo(url: string): RemoteOpenResult {
  const slug = new URL(url).pathname.slice(1);
  return {
    opened: {
      repo: {
        path: `/cache/remotes/github.com~${slug.replace("/", "~")}.git/`,
        name: slug,
        headBranch: "main",
        defaultBase: "main",
        remoteUrl: url,
      },
      branches: ["main"],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function overview(base: string, head: string): BranchOverview {
  return {
    repoPath: clone.path,
    currentBranch: "main",
    baseBranch: base,
    mergeBase: "base0",
    headOid: head,
    isLive: false,
    files: [],
  };
}

mock.module("@/shared/tauri/api", () => ({
  api: {
    openRepository: async (path: string) => {
      calls.push(`open:${path}`);
      return path.startsWith("/local/") ? localRepo(path) : opened;
    },
    openRemoteRepository: (url: string) => {
      calls.push(`remote:${url}`);
      return remoteResult(url);
    },
    fetchRemoteRepository: (repoPath: string) => {
      calls.push(`fetch:${repoPath}`);
      return fetchResult();
    },
    getComparisonStamp: async () => ({
      mergeBase: "base0",
      headOid: "tip",
      isLive: false,
    }),
    getBranchOverview: async (_repo: string, base: string, head: string) => {
      calls.push(`overview:${base}..${head}`);
      return overview(base, head);
    },
    getBranchFileDiffs: async () => [],
  },
}));

const { act, useCallback, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");
const { makeComparisonKey } = await import(
  "@/features/branch-compare/comparisonKey"
);
const { useRepoSessionState } = await import("./useRepoSession");

type SessionApi = ReturnType<typeof useRepoSessionState>;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let unmountSession: (() => void) | null = null;

beforeEach(() => {
  calls.length = 0;
  remoteResult = async () => ({
    opened,
    review: { baseBranch: "release", headBranch: "pr/31" },
  });
  fetchResult = async () => opened;
});

afterEach(() => {
  unmountSession?.();
  unmountSession = null;
});

function renderSession(
  cliRemoteUrls: string[] = [],
  initial: Partial<AppSettings> = {},
  openedWorkspaces: OpenRepoResult[] = [],
) {
  const patches: Partial<AppSettings>[] = [];
  let session: SessionApi | null = null;
  let latest: AppSettings | null = null;

  // Patches merge into React state, as `useSettings` does.
  function Harness() {
    const [settings, setSettings] = useState<AppSettings>(() => ({
      ...DEFAULT_SETTINGS,
      launchMode: "empty",
      ...initial,
    }));
    latest = settings;
    const update = useCallback(async (patch: Partial<AppSettings>) => {
      patches.push(patch);
      setSettings((prev) => ({ ...prev, ...patch }));
    }, []);
    session = useRepoSessionState(
      settings,
      update,
      null,
      openedWorkspaces,
      [],
      cliRemoteUrls,
    );
    return null;
  }

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
  return { session: () => session!, patches, settings: () => latest! };
}

describe("remote workspaces", () => {
  test("a pull request URL opens the review against its base", async () => {
    const { session, patches } = renderSession();
    const url = "https://github.com/sergichafer/diffview/pull/31";

    await act(async () => {
      await session().openRepo(url);
    });
    await flush();

    expect(calls[0]).toBe(`remote:${url}`);
    expect(calls).not.toContain(`open:${url}`);
    expect(session().workspaceOrder).toEqual([clone.path]);
    expect(session().activeKey).toBe(
      makeComparisonKey(clone.path, "release", "pr/31"),
    );
    expect(calls).toContain("overview:release..pr/31");
    expect(session().remoteOpens).toEqual([]);
    expect(patches.find((p) => p.recentRepos)?.recentRepos?.[0]).toBe(
      "https://github.com/sergichafer/diffview",
    );
  });

  test("a repository URL uses the default comparison", async () => {
    remoteResult = async () => ({ opened, review: undefined });
    const { session } = renderSession();

    await act(async () => {
      await session().openRemote("https://github.com/sergichafer/diffview");
    });

    const row = session().comparisons[session().activeKey!];
    expect(row?.repoPath).toBe(clone.path);
    expect(row?.baseBranch).toBe("main");
  });

  test("a failed clone stays listed until dismissed", async () => {
    remoteResult = async () => {
      throw "Repository not found.";
    };
    const { session } = renderSession();
    const url = "https://github.com/a/missing";

    await act(async () => {
      await session().openRemote(url);
    });

    expect(session().workspaceOrder).toEqual([]);
    expect(session().remoteOpens).toEqual([
      { url, error: "Repository not found." },
    ]);

    act(() => session().dismissRemoteOpen(url));
    expect(session().remoteOpens).toEqual([]);
  });

  test("refresh fetches a remote workspace before reloading", async () => {
    const { session } = renderSession();
    await act(async () => {
      await session().openRemote("https://github.com/sergichafer/diffview/pull/31");
    });
    await flush();
    calls.length = 0;

    await act(async () => {
      await session().refreshOverview();
    });
    await flush();

    expect(calls[0]).toBe(`fetch:${clone.path}`);
    expect(calls).toContain("overview:release..pr/31");
  });

  test("a failed fetch is reported and the cached clone still loads", async () => {
    const { session } = renderSession();
    await act(async () => {
      await session().openRemote("https://github.com/sergichafer/diffview/pull/31");
    });
    await flush();
    fetchResult = async () => {
      throw "Could not resolve host: github.com";
    };
    calls.length = 0;

    await act(async () => {
      await session().refreshOverview();
    });
    await flush();

    expect(calls).toContain("overview:release..pr/31");
    expect(session().remoteOpens).toEqual([
      {
        url: "https://github.com/sergichafer/diffview",
        error: "Could not fetch: Could not resolve host: github.com",
      },
    ]);
  });

  test("CLI remote URLs open in argument order after mount", async () => {
    const first = "https://github.com/a/one";
    const second = "https://github.com/sergichafer/diffview/pull/31";
    renderSession([first, second]);
    await flush();
    await flush();

    expect(calls.filter((c) => c.startsWith("remote:"))).toEqual([
      `remote:${first}`,
      `remote:${second}`,
    ]);
  });
  test("a slow clone keeps a local repo opened while it ran in recents", async () => {
    const slow = deferred<RemoteOpenResult>();
    const remote = "https://github.com/a/slow";
    remoteResult = () => slow.promise;
    const { session, settings } = renderSession([], { recentRepos: ["/old"] });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = session().openRepo(remote);
    });
    await act(async () => {
      await session().openRepo("/local/b");
    });
    expect(settings().recentRepos).toEqual(["/local/b", "/old"]);

    await act(async () => {
      slow.resolve(remoteRepo(remote));
      await pending;
    });
    expect(settings().recentRepos).toEqual([remote, "/local/b", "/old"]);
  });

  test("every CLI remote URL lands in recents", async () => {
    const first = "https://github.com/a/one";
    const second = "https://github.com/b/two";
    remoteResult = async (url) => remoteRepo(url);
    const { session, settings } = renderSession([first, second]);
    await flush();
    await flush();

    expect(settings().recentRepos.slice(0, 2)).toEqual([second, first]);
    expect(session().workspaceOrder).toHaveLength(2);
  });

  test("credentials in the input reach the backend only", async () => {
    const slow = deferred<RemoteOpenResult>();
    remoteResult = () => slow.promise;
    const { session } = renderSession();
    const raw = "https://me:ghp_secret@github.com/a/b";

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = session().openRemote(raw);
    });
    expect(calls).toContain(`remote:${raw}`);
    expect(session().remoteOpens).toEqual([
      { url: "https://github.com/a/b", error: null },
    ]);

    await act(async () => {
      slow.reject("Authentication failed for 'https://github.com/a/b'");
      await pending;
    });
    expect(JSON.stringify(session().remoteOpens)).not.toContain("ghp_secret");
  });

  test("a successful open clears a fetch error for the same remote", async () => {
    const { session } = renderSession();
    const pr = "https://github.com/sergichafer/diffview/pull/31";
    await act(async () => {
      await session().openRemote(pr);
    });
    await flush();
    fetchResult = async () => {
      throw "Could not resolve host: github.com";
    };
    await act(async () => {
      await session().refreshOverview();
    });
    await flush();
    expect(session().remoteOpens).toHaveLength(1);

    await act(async () => {
      await session().openRemote(pr);
    });
    expect(session().remoteOpens).toEqual([]);
  });

  test("a syncing row can be dismissed and does not come back on success", async () => {
    const slow = deferred<RemoteOpenResult>();
    remoteResult = () => slow.promise;
    const { session } = renderSession();
    const url = "https://github.com/a/b";

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = session().openRemote(url);
    });
    act(() => session().dismissRemoteOpen(url));
    expect(session().remoteOpens).toEqual([]);

    await act(async () => {
      slow.resolve(remoteRepo(url));
      await pending;
    });
    expect(session().remoteOpens).toEqual([]);
    expect(session().workspaceOrder).toHaveLength(1);
  });

  test("a dismissed syncing row reports a later failure and a retry shows it", async () => {
    const slow = deferred<RemoteOpenResult>();
    remoteResult = () => slow.promise;
    const { session } = renderSession();
    const url = "https://github.com/a/b";

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = session().openRemote(url);
    });
    act(() => session().dismissRemoteOpen(url));
    await act(async () => {
      await session().openRemote(url);
    });
    expect(session().remoteOpens).toEqual([{ url, error: null }]);
    expect(calls.filter((c) => c.startsWith("remote:"))).toHaveLength(1);

    act(() => session().dismissRemoteOpen(url));
    await act(async () => {
      slow.reject("git timed out after 120s");
      await pending;
    });
    expect(session().remoteOpens).toEqual([
      { url, error: "git timed out after 120s" },
    ]);
  });
});

describe("persisted remote workspaces", () => {
  const remoteUrl = "https://github.com/sergichafer/diffview";

  /** Tree with a local repo and a remote workspace at `clonePath`. */
  function treeSettings(clonePath: string): Partial<AppSettings> {
    return {
      workspaceTree: {
        workspaces: [
          {
            repoPath: "/local/a",
            collapsed: false,
            comparisons: [{ baseBranch: "main", headBranch: "main" }],
          },
          {
            repoPath: clonePath,
            collapsed: true,
            comparisons: [
              { baseBranch: "main", headBranch: "release" },
              { baseBranch: "release", headBranch: "main" },
            ],
            remoteUrl,
          },
        ],
        activeComparisonKey: makeComparisonKey(clonePath, "release", "main"),
        columnCollapsed: false,
      },
    };
  }

  test("a missing clone is re-cloned and restored at the same path", async () => {
    const slow = deferred<RemoteOpenResult>();
    remoteResult = () => slow.promise;
    const { session, settings } = renderSession([], treeSettings(clone.path), [
      localRepo("/local/a"),
    ]);
    await flush();

    expect(calls).toContain(`remote:${remoteUrl}`);
    expect(session().remoteOpens).toEqual([{ url: remoteUrl, error: null }]);
    expect(session().recoveryPaths).toEqual([clone.path]);
    // Still persisted, in place, while the clone runs.
    expect(settings().workspaceTree).toEqual(treeSettings(clone.path).workspaceTree);

    await act(async () => {
      slow.resolve({ opened });
    });
    await flush();

    expect(session().remoteOpens).toEqual([]);
    expect(session().workspaceOrder).toEqual(["/local/a", clone.path]);
    expect(session().groups[clone.path]?.collapsed).toBe(true);
    expect(session().groups[clone.path]?.comparisonKeys).toEqual([
      makeComparisonKey(clone.path, "main", "release"),
      makeComparisonKey(clone.path, "release", "main"),
    ]);
    expect(session().activeKey).toBe(
      makeComparisonKey(clone.path, "release", "main"),
    );
    const persisted = settings().workspaceTree?.workspaces ?? [];
    expect(persisted.map((ws) => ws.repoPath)).toEqual(["/local/a", clone.path]);
    expect(persisted[1]?.remoteUrl).toBe(remoteUrl);
  });

  test("a clone that lands at a new path takes the re-keyed comparisons", async () => {
    const oldPath = "/cache/remotes/github.com~SergiChafer~diffview.git/";
    remoteResult = async () => ({ opened });
    const { session, settings } = renderSession([], treeSettings(oldPath), [
      localRepo("/local/a"),
    ]);
    await flush();
    await flush();

    expect(session().workspaceOrder).toEqual(["/local/a", clone.path]);
    expect(session().activeKey).toBe(
      makeComparisonKey(clone.path, "release", "main"),
    );
    expect(Object.keys(session().comparisons).some((k) => k.startsWith(oldPath))).toBe(
      false,
    );
    const persisted = settings().workspaceTree!;
    expect(persisted.workspaces.map((ws) => ws.repoPath)).toEqual([
      "/local/a",
      clone.path,
    ]);
    expect(persisted.workspaces[1]?.comparisons).toHaveLength(2);
    expect(persisted.activeComparisonKey).toBe(
      makeComparisonKey(clone.path, "release", "main"),
    );
  });

  test("recovery fetches the reviews persisted comparisons use", async () => {
    const tree = treeSettings(clone.path);
    tree.workspaceTree!.workspaces[1]!.comparisons = [
      { baseBranch: "release", headBranch: "pr/31" },
      { baseBranch: "main", headBranch: "release" },
    ];
    const bare = { ...opened, branches: ["main", "release"] };
    remoteResult = async (url) =>
      url.endsWith("/pull/31")
        ? { opened, review: { baseBranch: "release", headBranch: "pr/31" } }
        : { opened: bare };
    const { session } = renderSession([], tree, [localRepo("/local/a")]);
    await flush();
    await flush();

    expect(calls.filter((c) => c.startsWith("remote:"))).toEqual([
      `remote:${remoteUrl}`,
      `remote:${remoteUrl}/pull/31`,
    ]);
    expect(session().groups[clone.path]?.branches).toContain("pr/31");
    expect(session().workspaceOrder).toEqual(["/local/a", clone.path]);
  });

  function workspace(repoPath: string, url?: string) {
    return {
      repoPath,
      collapsed: false,
      comparisons: [{ baseBranch: "main", headBranch: "main" }],
      ...(url ? { remoteUrl: url } : {}),
    };
  }

  test("a recovered clone returns between its persisted neighbours", async () => {
    remoteResult = async () => ({ opened });
    const { session, settings } = renderSession(
      [],
      {
        workspaceTree: {
          workspaces: [
            workspace("/local/a"),
            workspace(clone.path, remoteUrl),
            workspace("/local/b"),
          ],
          activeComparisonKey: makeComparisonKey("/local/a", "main", "main"),
          columnCollapsed: false,
        },
      },
      [localRepo("/local/a"), localRepo("/local/b")],
    );
    await flush();
    await flush();

    const order = ["/local/a", clone.path, "/local/b"];
    expect(session().workspaceOrder).toEqual(order);
    expect(settings().workspaceTree?.workspaces.map((ws) => ws.repoPath)).toEqual(
      order,
    );
  });

  test("remotes restored out of order still follow the persisted tree", async () => {
    const first = "https://github.com/owner/first";
    const second = "https://github.com/owner/second";
    const firstPath = remoteRepo(first).opened.repo.path;
    const secondPath = remoteRepo(second).opened.repo.path;
    let firstFails = true;
    remoteResult = async (url) => {
      if (url === first && firstFails) throw "Could not resolve host: github.com";
      return remoteRepo(url);
    };
    const { session, settings } = renderSession(
      [],
      {
        workspaceTree: {
          workspaces: [
            workspace("/local/a"),
            workspace(firstPath, first),
            // Lands at a new path, so the first remote finds it re-keyed.
            workspace("/cache/old/second.git/", second),
            workspace("/local/b"),
          ],
          activeComparisonKey: makeComparisonKey("/local/a", "main", "main"),
          columnCollapsed: false,
        },
      },
      [localRepo("/local/a"), localRepo("/local/b")],
    );
    await flush();
    await flush();

    expect(session().workspaceOrder).toEqual(["/local/a", secondPath, "/local/b"]);

    firstFails = false;
    await act(async () => {
      await session().openRepo(first);
    });
    await flush();

    const order = ["/local/a", firstPath, secondPath, "/local/b"];
    expect(session().workspaceOrder).toEqual(order);
    expect(settings().workspaceTree?.workspaces.map((ws) => ws.repoPath)).toEqual(
      order,
    );
  });

  test("a failed recovery stays persisted until its row is dismissed", async () => {
    remoteResult = async () => {
      throw "Could not resolve host: github.com";
    };
    const { session, settings } = renderSession([], treeSettings(clone.path), [
      localRepo("/local/a"),
    ]);
    await flush();
    await flush();

    expect(session().workspaceOrder).toEqual(["/local/a"]);
    expect(session().remoteOpens).toEqual([
      { url: remoteUrl, error: "Could not resolve host: github.com" },
    ]);
    expect(settings().workspaceTree).toEqual(treeSettings(clone.path).workspaceTree);

    act(() => session().dismissRemoteOpen(remoteUrl));
    await flush();

    expect(session().remoteOpens).toEqual([]);
    expect(settings().workspaceTree?.workspaces.map((ws) => ws.repoPath)).toEqual([
      "/local/a",
    ]);
  });
});

