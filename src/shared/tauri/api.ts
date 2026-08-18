/** Tauri command seam. Refresh: overview first, then batched file diffs. */
import { invoke } from "@tauri-apps/api/core";
import type {
  BranchMetadata,
  BranchOverview,
  ComparisonFileContents,
  ComparisonStamp,
  FileDiffResult,
  OpenRepoResult,
} from "@/shared/types/app";

export const api = {
  openRepository: (path: string) =>
    invoke<OpenRepoResult>("open_repository", { path }),
  closeRepository: (repoPath: string) =>
    invoke<void>("close_repository", { repoPath }),
  getBranchOverview: (repoPath: string, baseBranch: string, headBranch: string) =>
    invoke<BranchOverview>("get_branch_overview", {
      repoPath,
      baseBranch,
      headBranch,
    }),
  getBranchMetadata: (repoPath: string, baseBranch: string) =>
    invoke<BranchMetadata[]>("get_branch_metadata", { repoPath, baseBranch }),
  listBranches: (repoPath: string) =>
    invoke<string[]>("list_branches", { repoPath }),
  getBranchFileDiffs: (
    repoPath: string,
    baseBranch: string,
    headBranch: string,
    paths: string[],
  ) =>
    invoke<FileDiffResult[]>("get_branch_file_diffs", {
      repoPath,
      baseBranch,
      headBranch,
      paths,
    }),
  readWorkingFile: (repoPath: string, path: string) =>
    invoke<string>("read_working_file_contents", { repoPath, path }),
  readComparisonFile: (
    repoPath: string,
    baseBranch: string,
    headBranch: string,
    path: string,
    oldPath?: string | null,
  ) =>
    invoke<ComparisonFileContents>("read_comparison_file_contents", {
      repoPath,
      baseBranch,
      headBranch,
      path,
      oldPath: oldPath ?? null,
    }),
  writeWorkingFile: (
    repoPath: string,
    path: string,
    contents: string,
    expected: string | null,
  ) =>
    invoke<void>("write_working_file_contents", {
      repoPath,
      path,
      contents,
      expected,
    }),
  getComparisonStamp: (repoPath: string, baseBranch: string, headBranch: string) =>
    invoke<ComparisonStamp>("get_comparison_stamp", {
      repoPath,
      baseBranch,
      headBranch,
    }),
};
