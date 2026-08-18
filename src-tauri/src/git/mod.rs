mod comparison;
mod diff;
mod metadata;
mod overview;
mod repo;
mod session;
mod types;

pub use comparison::{resolve_comparison_stamp, ComparisonSpec, ResolutionCache};
pub use diff::{read_working_file, write_working_file};
pub use metadata::branch_metadata;
pub use repo::{discover_repo, list_branch_names, normalize_base_branch, repo_info};
pub use session::{close, open, with_repo, with_slot, RepoRegistry};
pub use types::{
    BranchMetadata, BranchOverview, ChangedFile, ComparisonFileContents, ComparisonStamp,
    FileBadge, FileDiffResult, OpenRepoResult, RepoInfo,
};
