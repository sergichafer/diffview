import { expect, test } from "bun:test";

const { act, useRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useDiffWorkspace } = await import("./useDiffWorkspace");

import type { ChangedFile, FileDiffResult } from "@/shared/types/app";
import type { CodeViewHandle } from "@pierre/diffs/react";

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

const file = (path: string): ChangedFile => ({ path, badges: ["committed"], isBinary: false });
const diff = (path: string): FileDiffResult => ({
  path,
  patch: patchFor(path),
  isBinary: false,
  oldPath: null,
  additions: 1,
  deletions: 0,
});

type Workspace = ReturnType<typeof useDiffWorkspace>;

function mount(files: ChangedFile[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: Workspace | null = null;

  function Harness({ fileDiffs }: { fileDiffs: FileDiffResult[] }) {
    const codeViewRef = useRef<CodeViewHandle<undefined> | null>(null);
    latest = useDiffWorkspace({
      fileDiffs,
      files,
      viewedPaths: new Set(),
      expandedWhileViewed: new Set(),
      selectedPath: null,
      setSelectedPath: () => {},
      codeViewRef,
      workerPool: null,
      comparisonKey: "/repo|main|feature",
    });
    return null;
  }

  return {
    render: (fileDiffs: FileDiffResult[]) => act(() => root.render(<Harness fileDiffs={fileDiffs} />)),
    get: () => latest!,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("diffs streamed after an empty first render all become items", () => {
  // The overview arrives before any diff, so the first render has none.
  const files = ["src/z.ts", "a.ts", "src/b.ts"].map(file);
  const h = mount(files);
  h.render([]);
  expect(h.get().itemCount).toBe(0);

  h.render([diff("src/z.ts"), diff("a.ts")]);
  expect(h.get().itemCount).toBe(2);

  h.render([diff("src/z.ts"), diff("a.ts"), diff("src/b.ts")]);
  expect(h.get().itemCount).toBe(3);
  h.unmount();
});
