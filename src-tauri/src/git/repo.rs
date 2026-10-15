use git2::{BranchType, Repository};
use std::collections::HashSet;
use std::path::Path;

use super::types::RepoInfo;
use crate::remote;

pub(crate) fn resolve_commit<'repo>(
    repo: &'repo Repository,
    name: &str,
) -> Result<git2::Commit<'repo>, String> {
    // A fetched review head (`pr/31`) wins over a branch that shares its name.
    if name.starts_with("pr/") || name.starts_with("mr/") {
        if let Ok(commit) = repo
            .find_reference(&format!("refs/{name}"))
            .and_then(|r| r.peel_to_commit())
        {
            return Ok(commit);
        }
    }

    let specs = [
        format!("refs/heads/{name}"),
        format!("refs/remotes/origin/{name}"),
        format!("origin/{name}"),
        name.to_string(),
    ];

    for spec in specs {
        if let Ok(obj) = repo.revparse_single(&spec) {
            if let Ok(commit) = obj.peel_to_commit() {
                return Ok(commit);
            }
        }
    }

    Err(format!("Could not resolve branch ref: {name}"))
}

pub fn discover_repo(path: &str) -> Result<Repository, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    Repository::discover(path).map_err(|e| format!("Not a git repository: {e}"))
}

/// Origin URL of a bare clone (a remote workspace). Local checkouts have none.
fn remote_origin_url(repo: &Repository) -> Option<String> {
    if !repo.is_bare() {
        return None;
    }
    let remote = repo.find_remote("origin").ok()?;
    remote.url().map(str::to_string)
}

pub fn repo_info(repo: &Repository) -> Result<RepoInfo, String> {
    // A bare clone has no workdir; its git dir is the workspace identity, the
    // same path `build_branch_overview` reports.
    let root = if repo.is_bare() {
        Some(repo.path())
    } else {
        repo.workdir().or_else(|| repo.path().parent())
    }
    .ok_or_else(|| "Repository has no working directory".to_string())?;
    let path = root.to_string_lossy().to_string();
    let origin_url = remote_origin_url(repo);
    let name = origin_url
        .as_deref()
        .and_then(remote::display_name)
        .or_else(|| root.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .unwrap_or_else(|| "repository".to_string());
    let head_branch = current_branch_name(repo)?;
    let default_base = detect_default_base_name(repo);

    Ok(RepoInfo {
        path,
        name,
        head_branch,
        default_base,
        remote_url: origin_url.as_deref().map(remote::display_url),
    })
}

pub fn list_branch_names(repo: &Repository) -> Result<Vec<String>, String> {
    let mut names: HashSet<String> = HashSet::new();

    if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
        for branch in branches.flatten() {
            if let Ok(Some(name)) = branch.0.name() {
                names.insert(name.to_string());
            }
        }
    }

    if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
        for branch in branches.flatten() {
            if let Ok(Some(name)) = branch.0.name() {
                if let Some(short) = name.strip_prefix("origin/") {
                    names.insert(short.to_string());
                }
            }
        }
    }

    // Review heads fetched for a pull or merge request (`refs/pr/31` is `pr/31`).
    for glob in remote::REVIEW_REF_GLOBS {
        if let Ok(refs) = repo.references_glob(glob) {
            for reference in refs.flatten() {
                if let Some(short) = reference.name().and_then(|n| n.strip_prefix("refs/")) {
                    names.insert(short.to_string());
                }
            }
        }
    }

    let mut list: Vec<String> = names.into_iter().collect();
    list.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(list)
}

pub(crate) fn current_branch_name(repo: &Repository) -> Result<String, String> {
    if let Ok(head) = repo.head() {
        if let Some(name) = head.shorthand() {
            return Ok(name.to_string());
        }
    }
    Ok("HEAD".to_string())
}

fn detect_default_base_name(repo: &Repository) -> String {
    // A bare clone's HEAD is the remote's default branch.
    if repo.is_bare() {
        if let Ok(head) = repo.head() {
            if let Some(name) = head.shorthand() {
                return name.to_string();
            }
        }
    }

    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = reference.symbolic_target() {
            if let Some(short) = target.strip_prefix("refs/remotes/origin/") {
                if resolve_commit(repo, short).is_ok() {
                    return short.to_string();
                }
            }
        }
    }

    for candidate in ["main", "master", "develop"] {
        if resolve_commit(repo, candidate).is_ok() {
            return candidate.to_string();
        }
    }

    if let Ok(head) = repo.head() {
        if let Some(name) = head.shorthand() {
            return name.to_string();
        }
    }

    list_branch_names(repo)
        .ok()
        .and_then(|names| names.into_iter().next())
        .unwrap_or_else(|| "main".to_string())
}

pub fn normalize_base_branch(repo: &Repository, requested: &str) -> String {
    if resolve_commit(repo, requested).is_ok() {
        return requested.to_string();
    }
    detect_default_base_name(repo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_label_beats_a_branch_with_the_same_name() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("diffview-review-label-{stamp}"));
        let repo = Repository::init_bare(&dir).unwrap();
        let sig = git2::Signature::now("Diffview Test", "test@diffview.local").unwrap();
        let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let base = repo
            .commit(Some("refs/heads/main"), &sig, &sig, "base", &tree, &[])
            .unwrap();
        let base_commit = repo.find_commit(base).unwrap();
        let review = repo
            .commit(Some("refs/pr/31"), &sig, &sig, "review", &tree, &[&base_commit])
            .unwrap();
        repo.reference("refs/heads/pr/31", base, false, "shadow").unwrap();

        assert_eq!(resolve_commit(&repo, "pr/31").unwrap().id(), review);
        assert_eq!(resolve_commit(&repo, "main").unwrap().id(), base);
        // With no review ref, a branch named like one still resolves.
        repo.reference("refs/heads/pr/7", base, false, "branch").unwrap();
        assert_eq!(resolve_commit(&repo, "pr/7").unwrap().id(), base);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
