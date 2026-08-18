import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import type { FlatNode } from "./flatten";
import { WorkspaceGroupBlock } from "./WorkspaceGroupBlock";

interface WorkspacesTreeProps {
  workspaces: ReadonlyArray<{ id: string; group: WorkspaceGroup }>;
  comparisons: Record<ComparisonKey, ComparisonRow>;
  activeKey: ComparisonKey | null;
  panelFocused: boolean;
  columnCollapsed: boolean;
  flatNodes: FlatNode[];
  focusKey: string | null;
  onFocusId: (id: string) => void;
  onActivate: (key: ComparisonKey) => void;
  onToggleGroupCollapsed: (workspaceId: string) => void;
  onCloseComparison: (key: ComparisonKey) => void;
  onCloseWorkspace: (workspaceId: string) => Promise<void> | void;
  onOpenPaletteForWorkspace: (workspaceId: string) => void;
}

export function WorkspacesTree({
  workspaces,
  comparisons,
  activeKey,
  panelFocused,
  columnCollapsed,
  flatNodes,
  focusKey,
  onFocusId,
  onActivate,
  onToggleGroupCollapsed,
  onCloseComparison,
  onCloseWorkspace,
  onOpenPaletteForWorkspace,
}: WorkspacesTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeKey == null) return;
    const el = scrollRef.current?.querySelector(
      `[data-ws-key="${CSS.escape(activeKey)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  const onTreeKeyDown = (e: ReactKeyboardEvent) => {
    if (flatNodes.length === 0) return;
    const currentIndex = Math.max(
      0,
      flatNodes.findIndex((n) =>
        n.kind === "row" ? n.key === focusKey : n.workspaceId === focusKey,
      ),
    );

    const focusNode = (index: number) => {
      const node = flatNodes[index];
      if (!node) return;
      if (node.kind === "row") onFocusId(node.key);
      else onFocusId(node.workspaceId);
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusNode(Math.min(flatNodes.length - 1, currentIndex + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        focusNode(Math.max(0, currentIndex - 1));
        break;
      case "Home":
        e.preventDefault();
        focusNode(0);
        break;
      case "End":
        e.preventDefault();
        focusNode(flatNodes.length - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const node = flatNodes[currentIndex];
        if (!node) break;
        if (node.kind === "row") onActivate(node.key);
        else onToggleGroupCollapsed(node.workspaceId);
        break;
      }
      case "ArrowLeft": {
        const node = flatNodes[currentIndex];
        if (node?.kind === "group") {
          e.preventDefault();
          const group = workspaces.find((w) => w.id === node.workspaceId)?.group;
          if (group && !group.collapsed) onToggleGroupCollapsed(node.workspaceId);
        }
        break;
      }
      case "ArrowRight": {
        const node = flatNodes[currentIndex];
        if (node?.kind === "group") {
          e.preventDefault();
          const group = workspaces.find((w) => w.id === node.workspaceId)?.group;
          if (group?.collapsed) onToggleGroupCollapsed(node.workspaceId);
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        const node = flatNodes[currentIndex];
        if (node?.kind === "row") {
          e.preventDefault();
          onCloseComparison(node.key);
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      ref={scrollRef}
      className="workspaces-scroll"
      role="tree"
      aria-label="Workspaces and comparisons"
      tabIndex={columnCollapsed ? -1 : 0}
      inert={columnCollapsed}
      onKeyDown={onTreeKeyDown}
    >
      {workspaces.map(({ id, group }) => (
        <WorkspaceGroupBlock
          key={id}
          workspaceId={id}
          group={group}
          comparisons={comparisons}
          activeKey={activeKey}
          panelFocused={panelFocused}
          columnCollapsed={columnCollapsed}
          focusKey={focusKey}
          onFocusId={onFocusId}
          onActivate={onActivate}
          onToggleCollapsed={() => onToggleGroupCollapsed(id)}
          onCloseComparison={onCloseComparison}
          onCloseWorkspace={() => {
            void onCloseWorkspace(id);
          }}
          onOpenPalette={() => onOpenPaletteForWorkspace(id)}
        />
      ))}
    </div>
  );
}
