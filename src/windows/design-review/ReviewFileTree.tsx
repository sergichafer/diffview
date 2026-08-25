import { FileTree, useFileTree } from "@pierre/trees/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { treePaths } from "@/features/changed-files/treePaths";
import { usePierreTreeAdapter } from "@/features/file-navigation/usePierreTreeAdapter";
import { appTreeStyles } from "@/design/theme";
import type { ChangedFile, ThemeId, UiFontId } from "@/shared/types/app";

interface ReviewFileTreeProps {
  files: ChangedFile[];
  themeMode: "light" | "dark";
  themeId: ThemeId;
  uiFont: UiFontId;
  width: number;
  selectedPath: string | null;
  onNavigate: (path: string) => void;
}

export function ReviewFileTree({
  files,
  themeMode,
  themeId,
  uiFont,
  width,
  selectedPath,
  onNavigate,
}: ReviewFileTreeProps) {
  const paths = useMemo(
    () => treePaths(files.map((file) => file.path)),
    [files],
  );
  const treeStyles = useMemo(
    () => appTreeStyles(themeMode, themeId, uiFont),
    [themeMode, themeId, uiFont],
  );
  const fileByPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
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
