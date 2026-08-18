//! Resolve a base×head label pair once, then overview / diffs.
//!
//! # Live-mode invariant
//! `head == current_branch_name` (or empty head): live working-tree mode
//! (untracked included). Any other resolvable head: committed ref-to-ref;
//! working tree ignored. Base is always `normalize_base_branch`.

use git2::{Oid, Repository, Tree};
use std::collections::HashMap;

use super::diff::{comparison_file_contents, file_diff_for_path};
use super::overview::build_branch_overview;
use super::repo::{current_branch_name, normalize_base_branch, resolve_commit};
use super::types::{BranchOverview, ComparisonFileContents, ComparisonStamp, FileDiffResult};

/// Git's canonical empty tree OID (used before the first commit).
pub(crate) const EMPTY_TREE_OID: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Unresolved labels from the UI / settings.
#[derive(Debug, Clone)]
pub struct ComparisonSpec {
    pub base: String,
    pub head: String,
}

impl ComparisonSpec {
    pub fn new(base: impl Into<String>, head: impl Into<String>) -> Self {
        Self {
            base: base.into(),
            head: head.into(),
        }
    }

    pub fn overview(
        repo: &Repository,
        spec: &Self,
        cache: &mut ResolutionCache,
    ) -> Result<BranchOverview, String> {
        let resolved = resolve_cached(repo, cache, &spec.base, &spec.head)?;
        build_branch_overview(repo, &resolved)
    }

    pub fn file_diffs(
        repo: &Repository,
        spec: &Self,
        paths: &[String],
        cache: &mut ResolutionCache,
    ) -> Result<Vec<FileDiffResult>, String> {
        let resolved = resolve_cached(repo, cache, &spec.base, &spec.head)?;
        paths
            .iter()
            .map(|path| file_diff_for_path(repo, &resolved, path))
            .collect()
    }

    /// Full text for edit hydration / expand context.
    pub fn file_contents(
        repo: &Repository,
        spec: &Self,
        path: &str,
        old_path: Option<&str>,
        cache: &mut ResolutionCache,
    ) -> Result<ComparisonFileContents, String> {
        let resolved = resolve_cached(repo, cache, &spec.base, &spec.head)?;
        comparison_file_contents(repo, &resolved, path, old_path)
    }
}

/// ~100 bytes per entry, bounded by branch-pair churn; no eviction.
#[derive(Default)]
pub struct ResolutionCache {
    entries: HashMap<(String, String), CachedResolution>,
    pub(crate) hits: usize,
    pub(crate) misses: usize,
}

#[derive(Clone)]
struct CachedResolution {
    normalized_base: String,
    base_oid: Option<Oid>,
    current_branch: String,
    head_is_explicit: bool,
    effective_head_oid: Option<Oid>,
    merge_base_oid: String,
    head_oid: String,
    is_live: bool,
}

struct ResolutionProbe {
    normalized_base: String,
    base_oid: Option<Oid>,
    current_branch: String,
    head_is_explicit: bool,
    effective_head_oid: Option<Oid>,
}

fn probe_resolution(repo: &Repository, base: &str, head: &str) -> Result<ResolutionProbe, String> {
    let normalized_base = normalize_base_branch(repo, base);
    let base_oid = resolve_commit(repo, &normalized_base).ok().map(|c| c.id());
    let current_branch = current_branch_name(repo)?;
    let head_trimmed = head.trim();
    let head_is_explicit = !head_trimmed.is_empty() && head_trimmed != current_branch;
    // Mirror resolve_comparison's head selection exactly: an explicit head that
    // resolves wins; anything else (including an explicit head that fails to
    // resolve) falls back to HEAD's commit. The cached resolution depends on
    // that commit either way, so the probe must too.
    let explicit_head = if head_is_explicit {
        resolve_commit(repo, head_trimmed).ok()
    } else {
        None
    };
    let effective_head_oid = explicit_head
        .or_else(|| repo.head().ok().and_then(|r| r.peel_to_commit().ok()))
        .map(|c| c.id());

    Ok(ResolutionProbe {
        normalized_base,
        base_oid,
        current_branch,
        head_is_explicit,
        effective_head_oid,
    })
}

fn resolve_cached<'repo>(
    repo: &'repo Repository,
    cache: &mut ResolutionCache,
    base: &str,
    head: &str,
) -> Result<ResolvedComparison<'repo>, String> {
    let probe = probe_resolution(repo, base, head)?;
    let key = (base.to_string(), head.to_string());

    if let Some(entry) = cache.entries.get(&key) {
        if entry.normalized_base == probe.normalized_base
            && entry.base_oid == probe.base_oid
            && entry.current_branch == probe.current_branch
            && entry.head_is_explicit == probe.head_is_explicit
            && entry.effective_head_oid == probe.effective_head_oid
        {
            let entry = entry.clone();
            cache.hits += 1;
            return rematerialize(repo, &entry);
        }
    }

    cache.misses += 1;
    let resolved = resolve_comparison(repo, base, head)?;
    cache.entries.insert(
        key,
        CachedResolution {
            normalized_base: probe.normalized_base,
            base_oid: probe.base_oid,
            current_branch: probe.current_branch,
            head_is_explicit: probe.head_is_explicit,
            effective_head_oid: probe.effective_head_oid,
            merge_base_oid: resolved.merge_base_label.clone(),
            head_oid: resolved.head_oid.clone(),
            is_live: resolved.is_live(),
        },
    );
    Ok(resolved)
}

fn rematerialize<'repo>(
    repo: &'repo Repository,
    entry: &CachedResolution,
) -> Result<ResolvedComparison<'repo>, String> {
    let old_tree = if entry.merge_base_oid == EMPTY_TREE_OID {
        None
    } else {
        let oid = Oid::from_str(&entry.merge_base_oid).map_err(|e| e.to_string())?;
        Some(
            repo.find_commit(oid)
                .map_err(|e| e.to_string())?
                .tree()
                .map_err(|e| e.to_string())?,
        )
    };

    let head_tree = if entry.head_oid == EMPTY_TREE_OID {
        None
    } else {
        let oid = Oid::from_str(&entry.head_oid).map_err(|e| e.to_string())?;
        Some(
            repo.find_commit(oid)
                .map_err(|e| e.to_string())?
                .tree()
                .map_err(|e| e.to_string())?,
        )
    };

    let kind = if entry.is_live {
        HeadKind::WorkingTree
    } else {
        HeadKind::Committed
    };

    Ok(ResolvedComparison {
        base_label: entry.normalized_base.clone(),
        merge_base_label: entry.merge_base_oid.clone(),
        head_oid: entry.head_oid.clone(),
        old_tree,
        head_tree,
        kind,
    })
}

pub(crate) enum HeadKind {
    /// Merge-base vs workdir; used when head is the checked-out branch.
    WorkingTree,
    /// Merge-base vs head commit tree; workdir ignored.
    Committed,
}

/// `old_tree` is the merge-base (three-dot). New side is workdir or `head_tree`.
pub(crate) struct ResolvedComparison<'repo> {
    pub base_label: String,
    pub merge_base_label: String,
    pub head_oid: String,
    pub old_tree: Option<Tree<'repo>>,
    pub head_tree: Option<Tree<'repo>>,
    pub kind: HeadKind,
}

impl ResolvedComparison<'_> {
    pub fn is_live(&self) -> bool {
        matches!(self.kind, HeadKind::WorkingTree)
    }
}

/// Empty or current-branch head: live workdir. Other resolvable head: ref-to-ref.
/// Unresolvable head falls back to the checked-out branch.
pub(crate) fn resolve_comparison<'repo>(
    repo: &'repo Repository,
    base_branch: &str,
    head_branch: &str,
) -> Result<ResolvedComparison<'repo>, String> {
    let base = normalize_base_branch(repo, base_branch);
    let current = current_branch_name(repo)?;

    let head_trimmed = head_branch.trim();
    let head_explicit = !head_trimmed.is_empty() && head_trimmed != current;

    let head_commit = if head_explicit {
        resolve_commit(repo, head_trimmed).ok()
    } else {
        None
    };

    let (head_commit, kind) = match head_commit {
        Some(commit) => (Some(commit), HeadKind::Committed),
        None => (
            repo.head().ok().and_then(|r| r.peel_to_commit().ok()),
            HeadKind::WorkingTree,
        ),
    };

    let base_commit = resolve_commit(repo, &base).ok();

    let (merge_base_label, old_tree) = match (base_commit, head_commit.as_ref()) {
        (Some(base_c), Some(head_c)) => {
            let merge_base_oid = repo
                .merge_base(base_c.id(), head_c.id())
                .map_err(|e| e.to_string())?;
            let merge_base = repo
                .find_commit(merge_base_oid)
                .map_err(|e| e.to_string())?;
            let tree = merge_base.tree().map_err(|e| e.to_string())?;
            (merge_base.id().to_string(), Some(tree))
        }
        _ => (EMPTY_TREE_OID.to_string(), None),
    };

    let head_tree = head_commit.as_ref().and_then(|c| c.tree().ok());
    let head_oid = head_commit
        .as_ref()
        .map(|c| c.id().to_string())
        .unwrap_or_else(|| EMPTY_TREE_OID.to_string());

    Ok(ResolvedComparison {
        base_label: base,
        merge_base_label,
        head_oid,
        old_tree,
        head_tree,
        kind,
    })
}

/// OID stamp without walking trees.
pub fn resolve_comparison_stamp(
    repo: &Repository,
    base_branch: &str,
    head_branch: &str,
    cache: &mut ResolutionCache,
) -> Result<ComparisonStamp, String> {
    let resolved = resolve_cached(repo, cache, base_branch, head_branch)?;
    let is_live = resolved.is_live();
    Ok(ComparisonStamp {
        merge_base: resolved.merge_base_label,
        head_oid: resolved.head_oid,
        is_live,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn init(tag: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "diffview-comparison-test-{tag}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).expect("create temp repo dir");
            let repo = Repository::init(&path).expect("init repo");
            let mut config = repo.config().expect("config");
            config
                .set_str("user.name", "Diffview Test")
                .expect("user.name");
            config
                .set_str("user.email", "test@diffview.local")
                .expect("user.email");
            fs::write(path.join("README.md"), "# hello\n").expect("write file");
            let mut index = repo.index().expect("index");
            index.add_path(Path::new("README.md")).expect("add path");
            index.write().expect("write index");
            let tree_id = repo.index().expect("index").write_tree().expect("tree");
            let tree = repo.find_tree(tree_id).expect("find tree");
            let sig =
                git2::Signature::now("Diffview Test", "test@diffview.local").expect("signature");
            repo.commit(Some("refs/heads/main"), &sig, &sig, "initial", &tree, &[])
                .expect("commit");
            repo.set_head("refs/heads/main").expect("set head");
            Self { path }
        }

        fn open(&self) -> Repository {
            Repository::open(&self.path).expect("open repo")
        }

        fn commit_empty(&self, message: &str) {
            let repo = self.open();
            let sig =
                git2::Signature::now("Diffview Test", "test@diffview.local").expect("signature");
            let parent = repo.head().expect("head").peel_to_commit().expect("commit");
            let tree = parent.tree().expect("tree");
            repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
                .expect("commit");
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn resolution_cache_hits_and_misses_track_ref_moves() {
        let fixture = TestRepo::init("hits");
        let repo = fixture.open();
        let mut cache = ResolutionCache::default();

        resolve_cached(&repo, &mut cache, "main", "").expect("first resolve");
        assert_eq!(cache.misses, 1);
        assert_eq!(cache.hits, 0);

        resolve_cached(&repo, &mut cache, "main", "").expect("second resolve");
        assert_eq!(cache.misses, 1);
        assert_eq!(cache.hits, 1);

        fixture.commit_empty("advance tip");
        let repo = fixture.open();
        resolve_cached(&repo, &mut cache, "main", "").expect("resolve after ref move");
        assert_eq!(cache.misses, 2);
        assert_eq!(cache.hits, 1);
    }

    #[test]
    fn unresolved_explicit_head_invalidates_when_head_moves() {
        let fixture = TestRepo::init("unresolved-head");
        let repo = fixture.open();
        let mut cache = ResolutionCache::default();

        // Explicit but unresolvable head: live fallback against HEAD's commit.
        resolve_cached(&repo, &mut cache, "main", "ghost-branch").expect("first resolve");
        assert_eq!(cache.misses, 1);
        assert_eq!(cache.hits, 0);

        resolve_cached(&repo, &mut cache, "main", "ghost-branch").expect("second resolve");
        assert_eq!(cache.misses, 1);
        assert_eq!(cache.hits, 1);

        // HEAD moves while the explicit label stays unresolvable: the cached
        // resolution depended on HEAD's commit, so this must miss.
        fixture.commit_empty("advance tip");
        let repo = fixture.open();
        resolve_cached(&repo, &mut cache, "main", "ghost-branch").expect("resolve after HEAD move");
        assert_eq!(cache.misses, 2);
        assert_eq!(cache.hits, 1);
    }
}
