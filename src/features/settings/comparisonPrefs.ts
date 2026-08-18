import type { AppSettings, RepoInfo } from "@/shared/types/app";

/** Resolve preferred base/head labels from settings (not git resolve). */
export function resolveComparisonPrefs(
  settings: AppSettings,
  info: RepoInfo,
  branches: string[],
): { base: string; head: string } {
  // Empty list (unborn HEAD): keep RepoInfo labels. The backend owns the
  // live-mode rule (see src-tauri/src/git/comparison.rs module docs). This
  // module only picks labels.
  if (branches.length === 0) {
    return { base: info.defaultBase, head: info.headBranch };
  }
  const savedBase = settings.baseBranchByRepo[info.path] ?? info.defaultBase;
  const basePreferred = branches.includes(savedBase)
    ? savedBase
    : info.defaultBase;
  const base = branches.includes(basePreferred)
    ? basePreferred
    : branches[0]!;

  const savedHead = settings.headBranchByRepo[info.path];
  const headPreferred =
    savedHead && branches.includes(savedHead) ? savedHead : info.headBranch;
  const head = branches.includes(headPreferred)
    ? headPreferred
    : (branches.find((name) => name !== base) ?? base);

  return { base, head };
}

/** Overview refresh runs for any open repo; empty labels mean live mode. */
export function shouldLoadOverview(repoPath: string | null): boolean {
  return repoPath != null && repoPath !== "";
}
