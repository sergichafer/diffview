import type { DiffLineAnnotation } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs/react";
import type { CommentMeta } from "@/features/line-comments/commentMeta";

/**
 * Packed item identity for `syncPierreItems`. Low field is collapse (0..2)
 * plus edit; annotation stamp occupies the rest. Files with no comments use
 * stamp 0 so a comment on another file does not rewrite every row.
 */
export function itemViewVersion(
  collapseVersion: number,
  editing: boolean,
  annotationStamp = 0,
): number {
  return annotationStamp * 8 + collapseVersion * 2 + (editing ? 1 : 0);
}

/**
 * Collapse is the viewed default, flipped by `expandedWhileViewed`:
 * viewed files start collapsed; unviewed files start expanded. Membership
 * in the set inverts that so expand/collapse works without marking viewed.
 *
 * Version 0 = default expanded. Version 1 = collapsed. Version 2 = viewed
 * and expanded (`collapsed: false` so a prior collapse unfolds).
 * Unviewed expand also uses version 0 with `collapsed: false`.
 */
export function collapseItemVersion(
  path: string,
  viewedPaths: ReadonlySet<string>,
  expandedWhileViewed: ReadonlySet<string>,
): number {
  const viewed = viewedPaths.has(path);
  const flipped = expandedWhileViewed.has(path);
  if (!viewed && !flipped) return 0;
  if (viewed && flipped) return 2;
  return 1;
}

export type DisplayItemView = {
  viewedPaths: ReadonlySet<string>;
  expandedWhileViewed: ReadonlySet<string>;
  editablePaths: ReadonlySet<string>;
  editEnabledPaths: ReadonlySet<string>;
  annotationsById: Readonly<Record<string, DiffLineAnnotation<CommentMeta>[]>>;
  annotationsRev: number;
};

/**
 * Collapse, edit, and line annotations in one pass. `version` is
 * `itemViewVersion` so `syncPierreItems` sees overlay edits, including
 * clearing the last comment on a file.
 */
export function applyDisplayItems(
  items: readonly CodeViewDiffItem<CommentMeta>[],
  view: DisplayItemView,
): CodeViewDiffItem<CommentMeta>[] {
  return items.map((item) => {
    const collapseVersion = collapseItemVersion(
      item.id,
      view.viewedPaths,
      view.expandedWhileViewed,
    );
    const editing =
      view.editablePaths.has(item.id) && view.editEnabledPaths.has(item.id);
    const list = view.annotationsById[item.id];
    const annotations = list != null && list.length > 0 ? list : undefined;
    const collapsed = collapseVersion === 1;
    const annotationStamp = annotations == null ? 0 : view.annotationsRev;
    const version = itemViewVersion(collapseVersion, editing, annotationStamp);
    if (
      item.collapsed === collapsed &&
      item.edit === editing &&
      item.version === version &&
      item.annotations === annotations
    ) {
      return item;
    }
    return { ...item, collapsed, edit: editing, annotations, version };
  });
}
