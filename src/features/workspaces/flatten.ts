import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { WorkspaceGroup } from "@/features/repo-session/types";

export type FlatNode =
  | { kind: "group"; workspaceId: string }
  | { kind: "row"; key: ComparisonKey };

export function flattenWorkspaceNodes(
  workspaces: ReadonlyArray<{ id: string; group: WorkspaceGroup }>,
): FlatNode[] {
  const nodes: FlatNode[] = [];
  for (const { id, group } of workspaces) {
    nodes.push({ kind: "group", workspaceId: id });
    if (!group.collapsed) {
      for (const key of group.comparisonKeys) {
        nodes.push({ kind: "row", key });
      }
    }
  }
  return nodes;
}

export function comparisonNodes(
  nodes: readonly FlatNode[],
): Extract<FlatNode, { kind: "row" }>[] {
  return nodes.filter(
    (n): n is Extract<FlatNode, { kind: "row" }> => n.kind === "row",
  );
}
