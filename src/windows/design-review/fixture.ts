import { processFile } from "@pierre/diffs";
import type { CodeViewDiffItem, DiffLineAnnotation } from "@pierre/diffs/react";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import type { ComparisonRow, WorkspaceGroup } from "@/features/repo-session/types";
import type {
  BranchMetadata,
  BranchOverview,
  ChangedFile,
  FileDiffResult,
  RepoInfo,
} from "@/shared/types/app";
import {
  languageFromPath,
  makeAnnotation,
  type CommentMeta,
  type PathComments,
} from "./commentMeta";

export const REVIEW_REPO: RepoInfo = {
  path: "/Users/demo/diffview",
  name: "diffview",
  headBranch: "main",
  defaultBase: "main",
};

export const REVIEW_BASE = "main";
export const REVIEW_HEAD = "";
export const REVIEW_WORKSPACE_ID = "ws-diffview";
export const REVIEW_COMPARISON_KEY = makeComparisonKey(
  REVIEW_REPO.path,
  REVIEW_BASE,
  REVIEW_HEAD,
);

export const PANEL_PATH =
  "src/features/diff-workspace/BranchDiffPanel.tsx";
export const EDIT_PATH = "src/features/diff-edit/useDiffEdit.ts";
export const ITEMS_PATH = "src/features/diff-workspace/buildItems.ts";

export const REVIEW_FILES: ChangedFile[] = [
  { path: PANEL_PATH, badges: ["unstaged"], isBinary: false },
  { path: ITEMS_PATH, badges: ["unstaged"], isBinary: false },
  { path: EDIT_PATH, badges: ["committed"], isBinary: false },
];

const PANEL_PATCH = `diff --git a/src/features/diff-workspace/BranchDiffPanel.tsx b/src/features/diff-workspace/BranchDiffPanel.tsx
index 1111111..2222222 100644
--- a/src/features/diff-workspace/BranchDiffPanel.tsx
+++ b/src/features/diff-workspace/BranchDiffPanel.tsx
@@ -116,30 +116,34 @@ export function BranchDiffPanel({
   const renderHeaderMetadata = useDiffItemHeader({
     repoPath: repo?.path ?? "",
     viewedPaths,
     expandedWhileViewed,
     editablePaths,
     editingPaths,
     editAllowed,
     getSaveState,
     subscribeSaveState,
     onPreview,
     onViewedChange: handleViewedChange,
     onToggleDiffCollapsed: handleToggleDiffCollapsed,
     onStartEdit,
     onSaveEdit: handleSaveEdit,
     onDiscardEdit: handleDiscardEdit,
     onRetrySave: retrySave,
   });
${" "}
   const unsafeCSS = diffLayoutUnsafeCss(themeMode, themeId, uiFont, codeFont);
${" "}
   const diffOptions = useMemo((): CodeViewReactOptions => {
     return {
       theme: getPierreThemePair(themeId),
       themeType: themeMode,
       diffStyle,
       stickyHeaders: true,
+      layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
+      itemMetrics: { paddingBottom: 0 },
+      unsafeCSS,
+      loadDiffFiles,
     };
-  }, [themeMode, themeId]);
+  }, [themeMode, themeId, diffStyle, unsafeCSS, loadDiffFiles]);
${" "}
   const skippedCount = files.length - itemCount;
`;

const EDIT_PATCH = `diff --git a/src/features/diff-edit/useDiffEdit.ts b/src/features/diff-edit/useDiffEdit.ts
index 3333333..4444444 100644
--- a/src/features/diff-edit/useDiffEdit.ts
+++ b/src/features/diff-edit/useDiffEdit.ts
@@ -63,12 +63,12 @@ export function useDiffEdit({
   repoPath,
   baseBranch,
   headBranch,
-  isLive: editAllowed,
+  isLive,
   onSavedLive,
 }: UseDiffEditArgs) {
   const saveStatesRef = useRef(new Map<string, FileSaveState>());
   const lastSaved = useRef(new Map<string, string>());
   const pending = useRef(new Map<string, string>());
   const saveReady = useRef(new Set<string>());
`;

const ITEMS_PATCH = `diff --git a/src/features/diff-workspace/buildItems.ts b/src/features/diff-workspace/buildItems.ts
index 5555555..6666666 100644
--- a/src/features/diff-workspace/buildItems.ts
+++ b/src/features/diff-workspace/buildItems.ts
@@ -94,11 +94,12 @@ function buildItemFromResult(
   const editable = isEditableResult(result, fileDiff);
${" "}
   const item: CodeViewDiffItem = {
     id: path,
     type: "diff",
     fileDiff,
     edit: false,
+    annotations: [],
   };
   itemCache.set(cacheKey, item);
   return { item, editable };
`;

export const REVIEW_PATCHES: Record<string, string> = {
  [PANEL_PATH]: PANEL_PATCH.trimEnd() + "\n",
  [EDIT_PATH]: EDIT_PATCH.trimEnd() + "\n",
  [ITEMS_PATH]: ITEMS_PATCH.trimEnd() + "\n",
};

export const REVIEW_DIFF_RESULTS: FileDiffResult[] = REVIEW_FILES.map(
  (file) => ({
    path: file.path,
    patch: REVIEW_PATCHES[file.path] ?? "",
    isBinary: false,
    oldPath: null,
  }),
);

const PANEL_SNIPPET = `      layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
      itemMetrics: { paddingBottom: 0 },
      unsafeCSS,
      loadDiffFiles,
    };
  }, [themeMode, themeId, diffStyle, unsafeCSS, loadDiffFiles]);`;

const EDIT_SNIPPET = `    isLive,`;

export const PANEL_RANGE = {
  start: 142,
  end: 147,
  side: "additions" as const,
};

export const EDIT_RANGE = {
  start: 66,
  end: 66,
  side: "additions" as const,
};

export const PANEL_NOTE =
  "`loadDiffFiles` is in the dependency list but missing from the object. Include it in the returned options.";

export const EDIT_NOTE =
  "Rename `isLive` so the call site matches the hook. Ref-to-ref comparisons must stay read-only.";

function savedMeta(
  key: string,
  path: string,
  range: CommentMeta["range"],
  message: string,
  snippet: string,
): CommentMeta {
  return {
    kind: "saved",
    key,
    message,
    range,
    snippet,
    language: languageFromPath(path),
  };
}

export function seedComments(card: "saved" | "draft"): PathComments {
  const panelMeta: CommentMeta =
    card === "draft"
      ? {
          kind: "draft",
          key: "note-panel",
          message: PANEL_NOTE,
          range: PANEL_RANGE,
          snippet: PANEL_SNIPPET,
          language: languageFromPath(PANEL_PATH),
        }
      : savedMeta(
          "note-panel",
          PANEL_PATH,
          PANEL_RANGE,
          PANEL_NOTE,
          PANEL_SNIPPET,
        );

  const panel = makeAnnotation(PANEL_RANGE, panelMeta);
  const edit = makeAnnotation(
    EDIT_RANGE,
    savedMeta("note-edit", EDIT_PATH, EDIT_RANGE, EDIT_NOTE, EDIT_SNIPPET),
  );

  const comments: PathComments = {};
  if (panel) comments[PANEL_PATH] = [panel];
  if (edit) comments[EDIT_PATH] = [edit];
  return comments;
}

export function buildFixtureItems(
  comments: PathComments,
): CodeViewDiffItem<CommentMeta>[] {
  const items: CodeViewDiffItem<CommentMeta>[] = [];
  for (const file of REVIEW_FILES) {
    const patch = REVIEW_PATCHES[file.path];
    if (!patch) continue;
    const fileDiff = processFile(patch, {
      isGitDiff: true,
      throwOnError: false,
      cacheKey: file.path,
    });
    if (!fileDiff) continue;
    fileDiff.name = file.path;
    fileDiff.cacheKey = file.path;
    const annotations: DiffLineAnnotation<CommentMeta>[] =
      comments[file.path] ?? [];
    items.push({
      id: file.path,
      type: "diff",
      fileDiff,
      annotations,
      edit: false,
      version: 0,
    });
  }
  return items;
}

export const REVIEW_OVERVIEW: BranchOverview = {
  repoPath: REVIEW_REPO.path,
  currentBranch: "main",
  baseBranch: REVIEW_BASE,
  mergeBase: "a1b2c3d4e5f6",
  headOid: "f6e5d4c3b2a1",
  isLive: true,
  files: REVIEW_FILES,
};

export const REVIEW_METADATA: BranchMetadata[] = [
  {
    name: "main",
    ahead: 3,
    behind: 0,
    lastSubject: "Honor selected head for graph WIP",
    author: "sergi",
    authorInitials: "S",
    lastCommitTime: 1_724_500_000,
    isDefault: true,
    isCurrent: true,
  },
  {
    name: "feat/comments",
    ahead: 2,
    behind: 1,
    lastSubject: "Line comments and copy-for-AI",
    author: "sergi",
    authorInitials: "S",
    lastCommitTime: 1_724_490_000,
    isDefault: false,
    isCurrent: false,
  },
];

export function reviewComparisonRow(): ComparisonRow {
  return {
    key: REVIEW_COMPARISON_KEY,
    repoPath: REVIEW_REPO.path,
    baseBranch: REVIEW_BASE,
    headBranch: REVIEW_HEAD,
    residency: "hot",
    overview: REVIEW_OVERVIEW,
    fileDiffs: REVIEW_DIFF_RESULTS,
    loading: false,
    error: null,
    mergeBaseOid: REVIEW_OVERVIEW.mergeBase,
    headOid: REVIEW_OVERVIEW.headOid,
    isLive: true,
    outdated: false,
  };
}

export function reviewWorkspaceGroup(): WorkspaceGroup {
  return {
    repo: REVIEW_REPO,
    branches: ["main", "feat/comments"],
    collapsed: false,
    comparisonKeys: [REVIEW_COMPARISON_KEY],
    branchMetadata: REVIEW_METADATA,
    metadataLoading: false,
  };
}
