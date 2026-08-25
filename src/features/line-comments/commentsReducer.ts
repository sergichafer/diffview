import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";
import {
  EMPTY_PATH_COMMENTS,
  isCommentSlotOccupied,
  makeAnnotation,
  type CommentMeta,
  type CommentsMap,
  type PathComments,
} from "./commentMeta";

export type CommentsStore = {
  map: CommentsMap;
  commentsRev: number;
};

export const emptyCommentsStore: CommentsStore = {
  map: {},
  commentsRev: 0,
};

export type CommentsAction =
  | { type: "reset-key"; key: ComparisonKey }
  | { type: "evict-key"; key: ComparisonKey }
  | {
      type: "start-draft";
      key: ComparisonKey;
      path: string;
      range: SelectedLineRange;
      nextKey: string;
    }
  | {
      type: "save";
      key: ComparisonKey;
      path: string;
      commentKey: string;
      message: string;
      snippet: string;
      language: string;
    }
  | {
      type: "begin-edit";
      key: ComparisonKey;
      path: string;
      commentKey: string;
    }
  | {
      type: "delete";
      key: ComparisonKey;
      path: string;
      commentKey: string;
    };

function bump(store: CommentsStore, map: CommentsMap): CommentsStore {
  return { map, commentsRev: store.commentsRev + 1 };
}

function setPath(
  paths: PathComments,
  path: string,
  annotations: DiffLineAnnotation<CommentMeta>[],
): PathComments {
  if (annotations.length === 0) {
    if (!(path in paths)) return paths;
    const next = { ...paths };
    delete next[path];
    return next;
  }
  return { ...paths, [path]: annotations };
}

function stripDrafts(paths: PathComments): PathComments {
  let changed = false;
  const next: PathComments = {};
  for (const [path, annotations] of Object.entries(paths)) {
    const kept = annotations.filter(
      (annotation) => annotation.metadata.kind !== "draft",
    );
    if (kept.length !== annotations.length) changed = true;
    if (kept.length > 0) next[path] = kept;
  }
  return changed ? next : paths;
}

function rowOf(store: CommentsStore, key: ComparisonKey): PathComments {
  return store.map[key] ?? EMPTY_PATH_COMMENTS;
}

export function commentsReducer(
  store: CommentsStore,
  action: CommentsAction,
): CommentsStore {
  switch (action.type) {
    case "evict-key": {
      if (!(action.key in store.map)) return store;
      const map = { ...store.map };
      delete map[action.key];
      return bump(store, map);
    }
    case "reset-key": {
      return bump(store, { ...store.map, [action.key]: EMPTY_PATH_COMMENTS });
    }
    case "start-draft": {
      const draft = makeAnnotation({
        kind: "draft",
        key: action.nextKey,
        message: "",
        range: action.range,
        snippet: "",
        language: "",
      });
      if (draft == null) return store;
      const current = rowOf(store, action.key);
      const existing = current[action.path] ?? [];
      if (isCommentSlotOccupied(existing, action.range)) return store;
      const stripped = stripDrafts(current);
      const nextAnns = [...(stripped[action.path] ?? []), draft];
      const nextRow = setPath(stripped, action.path, nextAnns);
      return bump(store, { ...store.map, [action.key]: nextRow });
    }
    case "save": {
      const trimmed = action.message.trim();
      if (trimmed.length === 0) return store;
      const current = rowOf(store, action.key);
      const annotations = current[action.path];
      if (annotations == null) return store;
      let didChange = false;
      const nextAnns = annotations.map((annotation) => {
        if (
          annotation.metadata.key !== action.commentKey ||
          annotation.metadata.kind !== "draft"
        ) {
          return annotation;
        }
        didChange = true;
        return {
          ...annotation,
          metadata: {
            ...annotation.metadata,
            kind: "saved" as const,
            message: trimmed,
            snippet: action.snippet,
            language: action.language,
          },
        };
      });
      if (!didChange) return store;
      return bump(store, {
        ...store.map,
        [action.key]: setPath(current, action.path, nextAnns),
      });
    }
    case "begin-edit": {
      const current = rowOf(store, action.key);
      const annotations = current[action.path];
      if (annotations == null) return store;
      const target = annotations.find(
        (annotation) => annotation.metadata.key === action.commentKey,
      );
      if (target == null || target.metadata.kind !== "saved") return store;
      const stripped = stripDrafts(current);
      const afterStrip = stripped[action.path] ?? [];
      const nextAnns = afterStrip.map((annotation) => {
        if (annotation.metadata.key !== action.commentKey) return annotation;
        return {
          ...annotation,
          metadata: { ...annotation.metadata, kind: "draft" as const },
        };
      });
      return bump(store, {
        ...store.map,
        [action.key]: setPath(stripped, action.path, nextAnns),
      });
    }
    case "delete": {
      const current = rowOf(store, action.key);
      const annotations = current[action.path];
      if (annotations == null) return store;
      const nextAnns = annotations.filter(
        (annotation) => annotation.metadata.key !== action.commentKey,
      );
      if (nextAnns.length === annotations.length) return store;
      return bump(store, {
        ...store.map,
        [action.key]: setPath(current, action.path, nextAnns),
      });
    }
  }
}
