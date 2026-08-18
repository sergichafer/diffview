use serde::Serialize;
use typeshare::typeshare;

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: String,
    pub default_base: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRepoResult {
    pub repo: RepoInfo,
    pub branches: Vec<String>,
}

#[typeshare]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileBadge {
    Committed,
    Staged,
    Unstaged,
    Untracked,
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub badges: Vec<FileBadge>,
    pub is_binary: bool,
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchOverview {
    pub repo_path: String,
    pub current_branch: String,
    pub base_branch: String,
    pub merge_base: String,
    /// Tip of the resolved head; working-tree HEAD when live.
    pub head_oid: String,
    /// Empty or current-branch head.
    pub is_live: bool,
    pub files: Vec<ChangedFile>,
}

/// Cheap OID stamp for cache validation; no tree walks.
#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonStamp {
    pub merge_base: String,
    pub head_oid: String,
    pub is_live: bool,
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffResult {
    pub path: String,
    pub patch: String,
    pub is_binary: bool,
    pub old_path: Option<String>,
}

/// Full text for edit hydration / expand context.
#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonFileContents {
    /// Blob at the comparison old/merge-base tree (null if the file was added).
    pub old: Option<String>,
    /// Live: working-tree text; committed: head-tree blob (null if deleted).
    pub new: Option<String>,
}

/// Compare-palette row vs the applied base. ahead/behind from `graph_ahead_behind`.
#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchMetadata {
    pub name: String,
    pub ahead: u32,
    pub behind: u32,
    pub last_subject: String,
    pub author: String,
    pub author_initials: String,
    /// Tip commit time, Unix seconds (UTC).
    #[typeshare(serialized_as = "I54")]
    pub last_commit_time: i64,
    pub is_default: bool,
    pub is_current: bool,
}
