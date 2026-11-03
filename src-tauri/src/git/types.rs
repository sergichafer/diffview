use serde::{Serialize, Serializer};
use typeshare::typeshare;

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: String,
    pub default_base: String,
    /// Clone URL without credentials when the workspace is a remote clone.
    pub remote_url: Option<String>,
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

impl FileBadge {
    const ALL: [FileBadge; 4] = [
        FileBadge::Committed,
        FileBadge::Staged,
        FileBadge::Unstaged,
        FileBadge::Untracked,
    ];

    fn bit(self) -> u8 {
        1 << self as u8
    }
}

/// Set of badges, one bit each. Serializes as an array in `FileBadge` order.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FileBadges(u8);

impl FileBadges {
    pub fn insert(&mut self, badge: FileBadge) {
        self.0 |= badge.bit();
    }

    pub fn contains(self, badge: FileBadge) -> bool {
        self.0 & badge.bit() != 0
    }

    pub fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub fn iter(self) -> impl Iterator<Item = FileBadge> {
        FileBadge::ALL.into_iter().filter(move |&badge| self.contains(badge))
    }
}

impl FromIterator<FileBadge> for FileBadges {
    fn from_iter<I: IntoIterator<Item = FileBadge>>(badges: I) -> Self {
        let mut set = FileBadges::default();
        for badge in badges {
            set.insert(badge);
        }
        set
    }
}

impl Serialize for FileBadges {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(self.iter())
    }
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    #[typeshare(serialized_as = "Vec<FileBadge>")]
    pub badges: FileBadges,
    pub is_binary: bool,
    /// `.gitattributes` marks it `linguist-generated`, `-diff`, or `binary`.
    pub collapsed: bool,
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
    /// Added lines in `patch`, counted by libgit2. Zero for binary and placeholder patches.
    pub additions: u32,
    /// Removed lines in `patch`, counted by libgit2. Zero for binary and placeholder patches.
    pub deletions: u32,
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
    /// Git blob id of `old`. Changes whenever the old text changes.
    pub old_oid: Option<String>,
    /// Git blob id of `new`, hashed from disk when live.
    pub new_oid: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_badges_follow_declaration_order() {
        for (index, badge) in FileBadge::ALL.into_iter().enumerate() {
            assert_eq!(badge as usize, index);
        }
        assert_eq!(FileBadge::ALL.len(), FileBadge::Untracked as usize + 1);
    }

    #[test]
    fn file_badges_serialize_as_ordered_unique_array() {
        let badges: FileBadges = [
            FileBadge::Untracked,
            FileBadge::Committed,
            FileBadge::Untracked,
            FileBadge::Staged,
        ]
        .into_iter()
        .collect();
        assert_eq!(
            serde_json::to_string(&badges).unwrap(),
            r#"["committed","staged","untracked"]"#
        );
        assert_eq!(serde_json::to_string(&FileBadges::default()).unwrap(), "[]");
    }
}
