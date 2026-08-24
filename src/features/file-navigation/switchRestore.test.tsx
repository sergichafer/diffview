// Regression: A → B → A must restore the last *viewed* file, not the stale seed.
// Real BranchWorkspace composition (useActiveFileNavigation + usePersistActivePath
// + useDiffWorkspace) against a fake CodeViewHandle. Switch reconcile must use
// the NEW seed, not the previous row's selectedPath: that misses the new file
// set, commits files[0], and clobbers the remembered file in state and settings.
const { act, useCallback, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useActiveFileNavigation } = await import(
  "./useActiveFileNavigation"
);
const { usePersistActivePath } = await import(
  "./usePersistActivePath"
);
const { useDiffWorkspace } = await import("@/features/diff-workspace/useDiffWorkspace");

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import type { CodeViewHandle } from "@pierre/diffs/react";

function makeFakeCodeView() {
  const state = { scrollTop: 0, tops: new Map<string, number>() };
  const viewer = {
    getTopForItem: (id: string) => state.tops.get(id),
    getScrollTop: () => state.scrollTop,
    getScrollHeight: () => 100000,
    getItem: (_id: string) => null,
    updateItem: (_item: unknown) => {},
  };
  const handle = {
    getInstance: () => viewer,
    scrollTo: (cmd: { type: string; position?: number }) => {
      if (cmd.type === "position" && typeof cmd.position === "number") {
        state.scrollTop = cmd.position;
      }
    },
  } as unknown as CodeViewHandle<undefined>;
  return { state, viewer, handle };
}

function patchFor(path: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    "index 0000000..1111111 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -0,0 +1 @@",
    "+hello",
    "",
  ].join("\n");
}

const file = (path: string): ChangedFile => ({
  path,
  badges: ["committed"],
  isBinary: false,
});
const diff = (path: string): FileDiffResult => ({
  path,
  patch: patchFor(path),
  isBinary: false,
  oldPath: null,
});

interface HarnessProps {
  activeKey: string;
  files: ChangedFile[];
  handle: CodeViewHandle<undefined>;
  initialMap: Record<string, string>;
  onMap: (map: Record<string, string>) => void;
  capture: { workspace: ReturnType<typeof useDiffWorkspace> | null };
}

/** Mirrors BranchWorkspace's seed/persist/diff-workspace composition. */
function Harness({ activeKey, files, handle, initialMap, onMap, capture }: HarnessProps) {
  const [map, setMap] = useState<Record<string, string>>(initialMap);
  const update = useCallback(
    async (patch: { activePathByComparison?: Record<string, string> }) => {
      setMap((prev) => {
        const next = patch.activePathByComparison ?? prev;
        onMap(next);
        return next;
      });
    },
    [onMap],
  );

  const seedPath = map[activeKey] ?? null;
  const activeFile = useActiveFileNavigation({
    files,
    seedPath,
    comparisonKey: activeKey,
  });
  usePersistActivePath({
    comparisonKey: activeKey,
    selectedPath: activeFile.selectedPath,
    activePathByComparison: map,
    update,
  });
  const codeViewRef = useRef(handle);
  const workspace = useDiffWorkspace({
    fileDiffs: files.map((f) => diff(f.path)),
    files,
    viewedPaths: new Set(),
    expandedWhileViewed: new Set(),
    selectedPath: activeFile.selectedPath,
    setSelectedPath: activeFile.setSelectedPath,
    onViewportPath: activeFile.setSelectedPath,
    codeViewRef,
    workerPool: null,
    comparisonKey: activeKey,
  });
  capture.workspace = workspace;
  return null;
}

const filesA = ["f1.ts", "f2.ts", "midA.ts", "x.ts"].map(file);
const filesB = ["b1.ts", "b2.ts"].map(file);
const topsA = new Map([
  ["f1.ts", 0],
  ["f2.ts", 400],
  ["midA.ts", 800],
  ["x.ts", 1200],
]);
const topsB = new Map([
  ["b1.ts", 0],
  ["b2.ts", 400],
]);

const KEY_A = "/repo/a|main|feature";
const KEY_B = "/repo/b|main|dev";

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("comparison switch restores the last viewed file", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let restoreRaf = () => {};

  beforeAll(() => {
    const request = globalThis.requestAnimationFrame;
    const cancel = globalThis.cancelAnimationFrame;
    restoreRaf = () => {
      globalThis.requestAnimationFrame = request;
      globalThis.cancelAnimationFrame = cancel;
    };
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    restoreRaf();
  });

  test("A → B → A restores scrolled-to file and keeps it persisted", async () => {
    const fake = makeFakeCodeView();
    fake.state.tops = new Map(topsA);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let persisted: Record<string, string> = { [KEY_A]: "midA.ts" };
    const capture: HarnessProps["capture"] = { workspace: null };
    const onMap = (m: Record<string, string>) => {
      persisted = m;
    };

    // Persisted seed midA.ts; restore should land on it.
    await act(async () => {
      root.render(
        <Harness
          activeKey={KEY_A}
          files={filesA}
          handle={fake.handle}
          initialMap={{ [KEY_A]: "midA.ts" }}
          onMap={onMap}
          capture={capture}
        />,
      );
    });
    await flush();
    expect(fake.state.scrollTop).toBe(800);

    // Viewport report at x.ts must update selection and persist.
    fake.state.scrollTop = 1200;
    await act(async () => {
      capture.workspace!.handleScroll(1200, fake.handle.getInstance() as never);
    });
    await flush();
    expect(persisted[KEY_A]).toBe("x.ts");

    fake.state.tops = new Map(topsB);
    await act(async () => {
      root.render(
        <Harness
          activeKey={KEY_B}
          files={filesB}
          handle={fake.handle}
          initialMap={persisted}
          onMap={onMap}
          capture={capture}
        />,
      );
    });
    await flush();

    fake.state.tops = new Map(topsA);
    await act(async () => {
      root.render(
        <Harness
          activeKey={KEY_A}
          files={filesA}
          handle={fake.handle}
          initialMap={persisted}
          onMap={onMap}
          capture={capture}
        />,
      );
    });
    await flush();

    // Restore to x.ts; the remembered file must not be clobbered.
    expect(fake.state.scrollTop).toBe(1200);
    expect(persisted[KEY_A]).toBe("x.ts");
  });
});
