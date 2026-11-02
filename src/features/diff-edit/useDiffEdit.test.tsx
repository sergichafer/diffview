import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const writeWorkingFile = mock(
  (_repo: string, _path: string, _contents: string, _expected: string | null) =>
    Promise.resolve(),
);
const readComparisonFile = mock(
  (_repo: string, _base: string, _head: string, _path: string, _old?: string | null) =>
    Promise.resolve({ old: "old\n", new: "baseline\n" }),
);

mock.module("@/shared/tauri/api", () => ({
  api: {
    writeWorkingFile,
    readComparisonFile,
  },
}));

const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useDiffEdit } = await import("./useDiffEdit");
const { useDiffItemHeader } = await import("@/features/diff-workspace/DiffItemHeader");
import { processFile, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewItem } from "@pierre/diffs/react";
import type { FileSaveState } from "./saveStatus";

type HookApi = ReturnType<typeof useDiffEdit>;

function changeItem(path: string, isPartial = true): CodeViewItem {
  return {
    id: path,
    type: "diff",
    edit: true,
    fileDiff: {
      name: path,
      type: "change",
      isPartial,
      hunks: [],
      splitLineCount: 0,
      unifiedLineCount: 0,
      deletionLines: [],
      additionLines: [],
    } as FileDiffMetadata,
  };
}

function newItem(path: string): CodeViewItem {
  // Real parser output: processFile(newFilePatch) → type: "new", isPartial: true.
  return {
    id: path,
    type: "diff",
    edit: true,
    fileDiff: {
      name: path,
      type: "new",
      isPartial: true,
      hunks: [],
      splitLineCount: 0,
      unifiedLineCount: 0,
      deletionLines: [],
      additionLines: ["line"],
    } as FileDiffMetadata,
  };
}

function newItemFromProcessFile(path: string, contents: string): CodeViewItem {
  const lines = contents.endsWith("\n")
    ? contents.slice(0, -1).split("\n")
    : contents.split("\n");
  const body = lines.map((l) => `+${l}`).join("\n");
  const patch = [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    "",
  ].join("\n");
  const fileDiff = processFile(patch, { isGitDiff: true, throwOnError: true });
  if (!fileDiff) throw new Error("processFile returned null for new-file patch");
  fileDiff.name = path;
  return {
    id: path,
    type: "diff",
    edit: true,
    fileDiff,
  };
}

function file(path: string, contents: string): FileContents {
  return { name: path, contents, cacheKey: `new:${path}` };
}

function mountHook(args: {
  repoPath?: string | null;
  baseBranch?: string;
  headBranch?: string;
  isLive?: boolean;
  onSavedLive?: () => void;
}): {
  get: () => HookApi;
  setArgs: (next: Partial<typeof args>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: HookApi | null = null;
  let setProps: ((p: typeof args) => void) | null = null;

  function Harness({ props }: { props: typeof args }) {
    const api = useDiffEdit({
      repoPath: props.repoPath ?? "/repo",
      baseBranch: props.baseBranch ?? "main",
      headBranch: props.headBranch ?? "",
      isLive: props.isLive ?? true,
      onSavedLive: props.onSavedLive,
    });
    latest = api;
    return null;
  }

  function Host({ initial }: { initial: typeof args }) {
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

function statusOf(
  api: HookApi,
  path: string,
): FileSaveState | undefined {
  return api.getSaveState(path);
}

describe("useDiffEdit", () => {
  beforeEach(() => {
    writeWorkingFile.mockReset();
    writeWorkingFile.mockImplementation(() => Promise.resolve());
    readComparisonFile.mockReset();
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: "baseline\n" }),
    );
  });

  afterEach(() => {});

  test("no write before markSaveReady (hydration)", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "partial\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("hydrating");
    expect(writeWorkingFile).not.toHaveBeenCalled();

    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();
    h.unmount();
  });

  test("typing marks dirty and does not write until saveEdit", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "one\n"));
      h.get().onItemEditChange(item, file("a.ts", "two\n"));
      h.get().onItemEditChange(item, file("a.ts", "three\n"));
    });

    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");
    expect(writeWorkingFile).not.toHaveBeenCalled();
    await act(async () => {
      await Bun.sleep(450);
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();

    await act(async () => {
      await h.get().saveEdit("a.ts");
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("three\n");
    expect(writeWorkingFile.mock.calls[0]?.[3]).toBe("baseline\n");
    h.unmount();
  });

  test("onItemEditComplete flushes immediately", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    await act(async () => {
      h.get().onItemEditComplete(item, file("a.ts", "flushed\n"));
      await Promise.resolve();
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("flushed\n");
    h.unmount();
  });

  test("new file seeds baseline and saves", async () => {
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: null, new: null }),
    );
    const h = mountHook({});
    const item = newItem("fresh.ts");
    expect(item.fileDiff.isPartial).toBe(true);
    expect(item.fileDiff.type).toBe("new");

    await act(async () => {
      h.get().onItemEditChange(item, file("fresh.ts", "typed\n"));
      await Bun.sleep(0);
      await Promise.resolve();
      await Bun.sleep(0);
    });

    // Must seed via readComparisonFile, not sit in "hydrating" waiting for loadDiffFiles.
    expect(statusOf(h.get(), "fresh.ts")?.status).not.toBe("hydrating");
    expect(readComparisonFile).toHaveBeenCalled();
    expect(writeWorkingFile).not.toHaveBeenCalled();
    expect(statusOf(h.get(), "fresh.ts")?.status).toBe("dirty");

    await act(async () => {
      await h.get().saveEdit("fresh.ts");
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("typed\n");
    expect(writeWorkingFile.mock.calls[0]?.[3]).toBeNull();
    h.unmount();
  });

  test("added-file save works with real processFile metadata", async () => {
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: null, new: null }),
    );
    const h = mountHook({});
    const item = newItemFromProcessFile("parsed-new.ts", "hello\nworld\n");
    expect(item.fileDiff.type).toBe("new");
    expect(item.fileDiff.isPartial).toBe(true);

    await act(async () => {
      h.get().onItemEditChange(item, file("parsed-new.ts", "edited\n"));
      await Bun.sleep(0);
      await Promise.resolve();
      await Bun.sleep(0);
    });

    expect(statusOf(h.get(), "parsed-new.ts")?.status).not.toBe("hydrating");
    expect(readComparisonFile).toHaveBeenCalledWith(
      "/repo",
      "main",
      "",
      "parsed-new.ts",
      null,
    );
    expect(writeWorkingFile).not.toHaveBeenCalled();
    expect(statusOf(h.get(), "parsed-new.ts")?.status).toBe("dirty");

    await act(async () => {
      await h.get().saveEdit("parsed-new.ts");
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("edited\n");
    expect(writeWorkingFile.mock.calls[0]?.[3]).toBeNull();
    h.unmount();
  });

  test("conflict sets error status and does not clear pending", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    writeWorkingFile.mockImplementation(() =>
      Promise.reject("conflict: working-tree file changed since hydration"),
    );

    await act(async () => {
      h.get().onItemEditComplete(item, file("a.ts", "mine\n"));
      await Bun.sleep(0);
    });

    const state = statusOf(h.get(), "a.ts");
    expect(state?.status).toBe("error");
    expect(state?.error).toContain("conflict:");

    writeWorkingFile.mockClear();
    writeWorkingFile.mockImplementation(() => Promise.resolve());
    await act(async () => {
      h.get().retrySave("a.ts");
      await Bun.sleep(0);
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("mine\n");
    h.unmount();
  });

  test("save-state subscription notifies only the matching path", async () => {
    const h = mountHook({});
    const itemA = changeItem("a.ts");
    const itemB = changeItem("b.ts");
    await act(async () => {
      await h.get().loadDiffFiles(itemA.fileDiff);
      await h.get().loadDiffFiles(itemB.fileDiff);
    });

    let aNotifies = 0;
    let bNotifies = 0;
    const unsubA = h.get().subscribeSaveState("a.ts", () => {
      aNotifies += 1;
    });
    const unsubB = h.get().subscribeSaveState("b.ts", () => {
      bNotifies += 1;
    });

    act(() => {
      h.get().onItemEditChange(itemA, file("a.ts", "dirty-a\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");
    expect(aNotifies).toBeGreaterThan(0);
    expect(bNotifies).toBe(0);
    expect(statusOf(h.get(), "b.ts")).toBeUndefined();

    unsubA();
    unsubB();
    h.unmount();
  });

  test("renderHeaderMetadata identity is stable across save-status flips", async () => {
    const empty = new Set<string>();
    const noop = () => {};
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    type Latest = {
      edit: HookApi;
      renderHeaderMetadata: ReturnType<typeof useDiffItemHeader>;
      bump: () => void;
    };
    let latest: Latest | null = null;

    function Harness() {
      const edit = useDiffEdit({
        repoPath: "/repo",
        baseBranch: "main",
        headBranch: "",
        isLive: true,
      });
      const [, setTick] = useState(0);
      const renderHeaderMetadata = useDiffItemHeader({
        repoPath: "/repo",
        viewedPaths: empty,
        expandedWhileViewed: empty,
        editablePaths: empty,
        editingPaths: empty,
        editAllowed: true,
        getSaveState: edit.getSaveState,
        subscribeSaveState: edit.subscribeSaveState,
        onPreview: noop,
        onViewedChange: noop,
        onToggleDiffCollapsed: noop,
        onStartEdit: noop,
        onSaveEdit: noop,
        onDiscardEdit: noop,
        onRetrySave: edit.retrySave,
      });
      latest = {
        edit,
        renderHeaderMetadata,
        bump: () => setTick((t) => t + 1),
      };
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });
    if (!latest) throw new Error("harness not mounted");

    const item = changeItem("a.ts");
    await act(async () => {
      await latest!.edit.loadDiffFiles(item.fileDiff);
    });
    const before = latest.renderHeaderMetadata;

    act(() => {
      latest!.edit.onItemEditChange(item, file("a.ts", "dirty\n"));
    });
    expect(latest.edit.getSaveState("a.ts")?.status).toBe("dirty");

    // Force a parent re-render; callback must not remint from save status.
    act(() => {
      latest!.bump();
    });
    expect(latest.renderHeaderMetadata).toBe(before);

    act(() => root.unmount());
    container.remove();
  });

  test("non-live edit change produces no status and no write", async () => {
    const h = mountHook({ isLive: false, headBranch: "origin/feature" });
    const item = changeItem("a.ts");

    // Even if hydration somehow ran (UI should not attach editors), edits must
    // not flip status or schedule working-tree writes.
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    const readsAfterHydration = readComparisonFile.mock.calls.length;

    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "poison\n"));
    });
    expect(statusOf(h.get(), "a.ts")).toBeUndefined();
    expect(writeWorkingFile).not.toHaveBeenCalled();

    await act(async () => {
      h.get().onItemEditComplete(item, file("a.ts", "poison\n"));
      await Bun.sleep(450);
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();
    expect(readComparisonFile.mock.calls.length).toBe(readsAfterHydration);
    h.unmount();
  });

  test("comparison change clears edit state", async () => {
    const h = mountHook({ baseBranch: "main", headBranch: "feature" });
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "dirty\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");

    h.setArgs({ headBranch: "other" });
    expect(h.get().getSaveState("a.ts")).toBeUndefined();

    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "again\n"));
    });
    // Must re-hydrate after comparison change; not immediately writable.
    expect(statusOf(h.get(), "a.ts")?.status).toBe("hydrating");
    expect(writeWorkingFile).not.toHaveBeenCalled();
    h.unmount();
  });

  test("loadDiffFiles hydration error sets status and rethrows", async () => {
    readComparisonFile.mockImplementation(() =>
      Promise.reject(new Error("File a.ts is not valid UTF-8")),
    );
    const h = mountHook({});
    const item = changeItem("a.ts");
    let threw = false;
    await act(async () => {
      try {
        await h.get().loadDiffFiles(item.fileDiff);
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
    expect(statusOf(h.get(), "a.ts")?.status).toBe("error");
    expect(statusOf(h.get(), "a.ts")?.error).toContain("UTF-8");
    h.unmount();
  });

  test("remount re-reads sides without a hydrating flash", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    let first: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      first = await h.get().loadDiffFiles(item.fileDiff);
    });
    expect(readComparisonFile).toHaveBeenCalledTimes(1);
    expect(statusOf(h.get(), "a.ts")?.status).toBeUndefined();

    let second!: Promise<Awaited<ReturnType<HookApi["loadDiffFiles"]>>>;
    act(() => {
      second = h.get().loadDiffFiles(item.fileDiff);
    });
    // Already save-ready: the re-read must not flip the header to hydrating.
    expect(statusOf(h.get(), "a.ts")?.status).toBeUndefined();
    let sides: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      sides = await second;
    });
    expect(readComparisonFile).toHaveBeenCalledTimes(2);
    expect(statusOf(h.get(), "a.ts")?.status).toBeUndefined();
    expect(sides!.newFile.contents).toBe(first!.newFile.contents);
    expect(sides!.newFile).not.toBe(first!.newFile);
    h.unmount();
  });

  test("side cache keys follow blob ids so changed text is never served stale", async () => {
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: "one\n", oldOid: "o1", newOid: "n1" }),
    );
    const h = mountHook({});
    const item = changeItem("a.ts");
    let first: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      first = await h.get().loadDiffFiles(item.fileDiff);
    });

    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: "two\n", oldOid: "o1", newOid: "n2" }),
    );
    let second: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      second = await h.get().loadDiffFiles(item.fileDiff);
    });

    expect(second!.newFile.contents).toBe("two\n");
    expect(second!.newFile.cacheKey).not.toBe(first!.newFile.cacheKey);
    expect(second!.oldFile?.cacheKey).toBe(first!.oldFile?.cacheKey);
    h.unmount();
  });

  test("side cache keys differ for the same blob at two paths", async () => {
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "x\n", new: "x\n", oldOid: "same", newOid: "same" }),
    );
    const h = mountHook({});
    let a: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    let b: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      a = await h.get().loadDiffFiles(changeItem("a.ts").fileDiff);
      b = await h.get().loadDiffFiles(changeItem("b.py").fileDiff);
    });
    expect(a!.newFile.cacheKey).not.toBe(b!.newFile.cacheKey);
    h.unmount();
  });

  test("remount loadDiffFiles does not drop a pending unsaved buffer", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "edited\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");
    expect(writeWorkingFile).not.toHaveBeenCalled();

    // Pierre re-attaches the editor on scroll-back and re-calls loadDiffFiles.
    // Must not clear pending or re-baseline.
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");

    await act(async () => {
      await Bun.sleep(450);
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();

    await act(async () => {
      await h.get().saveEdit("a.ts");
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("edited\n");
    h.unmount();
  });

  test("re-read after an external edit re-baselines so the save is not skipped", async () => {
    let onDisk = "X\n";
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: onDisk, newOid: onDisk }),
    );
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    onDisk = "X2\n";
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    // The editor shows X2; typing the old text back is a real change on disk.
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "X\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");
    await act(async () => {
      await h.get().saveEdit("a.ts");
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(writeWorkingFile.mock.calls[0]?.[3]).toBe("X2\n");
    h.unmount();
  });

  test("re-read with a pending buffer keeps the old baseline for conflict detection", async () => {
    let onDisk = "X\n";
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: onDisk, newOid: onDisk }),
    );
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "mine\n"));
    });

    onDisk = "theirs\n";
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    await act(async () => {
      await h.get().saveEdit("a.ts");
    });
    expect(writeWorkingFile.mock.calls[0]?.[2]).toBe("mine\n");
    expect(writeWorkingFile.mock.calls[0]?.[3]).toBe("X\n");
    h.unmount();
  });

  test("a read that resolves after a comparison switch does not baseline the new one", async () => {
    let resolveRead: ((v: { old: string; new: string }) => void) | undefined;
    readComparisonFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const h = mountHook({ baseBranch: "main", headBranch: "feature" });
    const item = changeItem("a.ts");
    let inFlight!: Promise<unknown>;
    act(() => {
      inFlight = h.get().loadDiffFiles(item.fileDiff);
    });

    h.setArgs({ headBranch: "other" });
    await act(async () => {
      resolveRead?.({ old: "old\n", new: "from feature\n" });
      await inFlight;
    });

    // Not save-ready in the new comparison: edits wait for a fresh hydration.
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "edit\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("hydrating");
    await act(async () => {
      await h.get().saveEdit("a.ts");
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();
    h.unmount();
  });

  test("a new-file seed that resolves after a comparison switch is dropped", async () => {
    let resolveRead: ((v: { old: null; new: string }) => void) | undefined;
    readComparisonFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const h = mountHook({ baseBranch: "main", headBranch: "feature" });
    const item = newItem("fresh.ts");
    act(() => {
      h.get().onItemEditChange(item, file("fresh.ts", "typed\n"));
    });
    const staleResolve = resolveRead;

    h.setArgs({ headBranch: "other" });
    await act(async () => {
      staleResolve?.({ old: null, new: "from feature\n" });
      await Bun.sleep(0);
    });

    // The new comparison seeds again on the next edit instead of trusting the stale read.
    act(() => {
      h.get().onItemEditChange(item, file("fresh.ts", "typed again\n"));
    });
    expect(readComparisonFile).toHaveBeenCalledTimes(2);
    await act(async () => {
      await h.get().saveEdit("fresh.ts");
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();
    h.unmount();
  });

  test("remount after a save shows the written text", async () => {
    let onDisk = "baseline\n";
    writeWorkingFile.mockImplementation((_r, _p, contents) => {
      onDisk = contents;
      return Promise.resolve();
    });
    readComparisonFile.mockImplementation(() =>
      Promise.resolve({ old: "old\n", new: onDisk, newOid: onDisk }),
    );
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    await act(async () => {
      h.get().onItemEditComplete(item, file("a.ts", "saved\n"));
      await Promise.resolve();
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);

    let remount: Awaited<ReturnType<HookApi["loadDiffFiles"]>>;
    await act(async () => {
      remount = await h.get().loadDiffFiles(item.fileDiff);
    });
    expect(remount!.newFile.contents).toBe("saved\n");
    expect(statusOf(h.get(), "a.ts")?.status).toBeUndefined();
    h.unmount();
  });

  test("onSavedLive uses the latest callback after await write", async () => {
    let resolveWrite: (() => void) | undefined;
    writeWorkingFile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const liveA = mock(() => {});
    const liveB = mock(() => {});
    const h = mountHook({ onSavedLive: liveA });
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });
    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "saved\n"));
    });

    let saveResult: boolean | undefined;
    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = h.get().saveEdit("a.ts").then((ok) => {
        saveResult = ok;
        return ok;
      });
    });
    expect(writeWorkingFile).toHaveBeenCalledTimes(1);
    expect(liveA).not.toHaveBeenCalled();
    expect(liveB).not.toHaveBeenCalled();

    h.setArgs({ onSavedLive: liveB });
    await act(async () => {
      resolveWrite?.();
      await savePromise;
    });

    expect(saveResult).toBe(true);
    expect(liveB).toHaveBeenCalledTimes(1);
    expect(liveA).not.toHaveBeenCalled();
    h.unmount();
  });

  test("discardEdit restores the editor and skips the complete flush", async () => {
    const h = mountHook({});
    const item = changeItem("a.ts");
    await act(async () => {
      await h.get().loadDiffFiles(item.fileDiff);
    });

    act(() => {
      h.get().onItemEditChange(item, file("a.ts", "edited\n"));
    });
    expect(statusOf(h.get(), "a.ts")?.status).toBe("dirty");

    const applyEdits = mock(() => {});
    act(() => {
      h.get().discardEdit("a.ts", {
        getText: () => "edited\n",
        applyEdits,
      });
    });
    expect(applyEdits).toHaveBeenCalled();
    expect(statusOf(h.get(), "a.ts")?.status).toBeUndefined();
    expect(writeWorkingFile).not.toHaveBeenCalled();

    await act(async () => {
      h.get().onItemEditComplete(item, file("a.ts", "edited\n"));
      await Promise.resolve();
    });
    expect(writeWorkingFile).not.toHaveBeenCalled();
    h.unmount();
  });
});
