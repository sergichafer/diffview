import { FileTree, useFileTree } from "@pierre/trees/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { usePierreTreeAdapter } from "@/features/file-navigation/usePierreTreeAdapter";
import { treePaths } from "@/features/changed-files/treePaths";
import { appTreeStyles } from "@/design/theme";
import type { ThemeId, UiFontId } from "@/shared/types/app";
import { useRepoSession } from "@/features/repo-session/context";

interface FileTreePanelProps {
  themeMode: "light" | "dark";
  themeId: ThemeId;
  uiFont: UiFontId;
  width: number;
  selectedPath: string | null;
  onNavigate: (path: string) => void;
}

export function FileTreePanel({
  themeMode,
  themeId,
  uiFont,
  width,
  selectedPath,
  onNavigate,
}: FileTreePanelProps) {
  const { overview } = useRepoSession();
  const files = overview?.files;

  const paths = useMemo(
    () => treePaths((files ?? []).map((f) => f.path)),
    [files],
  );
  const treeStyles = useMemo(
    () => appTreeStyles(themeMode, themeId, uiFont),
    [themeMode, themeId, uiFont],
  );
  const fileByPath = useMemo(
    () => new Map((files ?? []).map((f) => [f.path, f])),
    [files],
  );

  const onSelectionChangeRef = useRef<(selected: readonly string[]) => void>(
    () => {},
  );

  const { model } = useFileTree({
    paths,
    initialExpansion: "open",
    renderRowDecoration: ({ row }) => {
      const file = fileByPath.get(row.path);
      if (!file || file.badges.length === 0) return null;
      const text = file.badges.join(" · ");
      return { text, title: text };
    },
    onSelectionChange: (selected) => onSelectionChangeRef.current(selected),
  });

  // useFileTree ignores later `paths`. Reset on a new path set only;
  // same-paths overview refresh must keep expansion. Before adapter
  // selection sync.
  const pathsKey = useMemo(() => paths.join("\0"), [paths]);
  const prevPathsKeyRef = useRef(pathsKey);
  useLayoutEffect(() => {
    if (prevPathsKeyRef.current === pathsKey) return;
    prevPathsKeyRef.current = pathsKey;
    model.resetPaths(paths);
  }, [model, paths, pathsKey]);

  const { handleSelectionChange } = usePierreTreeAdapter({
    model,
    paths,
    selectedPath,
    onNavigate,
  });

  useLayoutEffect(() => {
    onSelectionChangeRef.current = handleSelectionChange;
  });

  return (
    <aside className="tree-panel" aria-label="Changed files" style={{ width }}>
      <FileTree
        model={model}
        className="file-tree"
        style={treeStyles}
        data-theme={themeMode}
      />
    </aside>
  );
}
