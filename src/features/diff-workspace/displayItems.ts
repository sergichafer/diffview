import type { DiffLineAnnotation } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs/react";

/**
 * Collapse versions occupy 0..2. Edit folds that into 0..5
 * (`collapse * 2 + editBit`). `syncPierreItems` keys off `version`, so
 * annotation overlays shift by this stride (greater than the 0..5 range).
 */
export const ANNOTATION_VERSION_STRIDE = 8;

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

export function itemViewVersion(
  collapseVersion: number,
  editing: boolean,
  annotationsRev = 0,
): number {
  return (
    annotationsRev * ANNOTATION_VERSION_STRIDE +
    collapseVersion * 2 +
    (editing ? 1 : 0)
  );
}

export function applyViewedCollapse(
  items: readonly CodeViewDiffItem[],
  viewedPaths: ReadonlySet<string>,
  expandedWhileViewed: ReadonlySet<string>,
): CodeViewDiffItem[] {
  return items.map((item) => {
    const version = collapseItemVersion(
      item.id,
      viewedPaths,
      expandedWhileViewed,
    );
    const collapsed = version === 1;
    if (item.collapsed === collapsed && item.version === version) return item;
    return { ...item, collapsed, version };
  });
}

/**
 * Fold edit into `version` so `syncPierreItems` picks up the change.
 * Inputs are collapse-versioned (0/1/2).
 */
export function applyEditSession(
  items: readonly CodeViewDiffItem[],
  editablePaths: ReadonlySet<string>,
  editEnabledPaths: ReadonlySet<string>,
): CodeViewDiffItem[] {
  return items.map((item) => {
    const edit =
      editablePaths.has(item.id) && editEnabledPaths.has(item.id);
    const version = itemViewVersion(item.version ?? 0, edit);
    if (item.edit === edit && item.version === version) return item;
    return { ...item, edit, version };
  });
}

export type DisplayItemView<T = undefined> = {
  viewedPaths: ReadonlySet<string>;
  expandedWhileViewed: ReadonlySet<string>;
  editablePaths: ReadonlySet<string>;
  editEnabledPaths: ReadonlySet<string>;
  annotationsById?: Readonly<Record<string, DiffLineAnnotation<T>[]>>;
  annotationsRev?: number;
};

/**
 * Collapse, edit, and line annotations in one pass. `version` is
 * `itemViewVersion` so `syncPierreItems` sees annotation edits, including
 * clearing the last comment on a file.
 */
export function applyDisplayItems<T = undefined>(
  items: readonly CodeViewDiffItem[],
  view: DisplayItemView<T>,
): CodeViewDiffItem<T>[] {
  const annotationsRev = view.annotationsRev ?? 0;
  const annotationsById = view.annotationsById;
  return items.map((item) => {
    const collapseVersion = collapseItemVersion(
      item.id,
      view.viewedPaths,
      view.expandedWhileViewed,
    );
    const editing =
      view.editablePaths.has(item.id) && view.editEnabledPaths.has(item.id);
    const list = annotationsById?.[item.id];
    const annotations = list != null && list.length > 0 ? list : undefined;
    const collapsed = collapseVersion === 1;
    const version = itemViewVersion(collapseVersion, editing, annotationsRev);
    if (
      item.collapsed === collapsed &&
      item.edit === editing &&
      item.version === version &&
      item.annotations === annotations
    ) {
      return item as CodeViewDiffItem<T>;
    }
    return { ...item, collapsed, edit: editing, annotations, version };
  });
}
