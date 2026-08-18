use git2::{BranchType, Repository};
use std::collections::HashSet;
use std::path::Path;

use super::types::RepoInfo;

pub(crate) fn resolve_commit<'repo>(
    repo: &'repo Repository,
    name: &str,
) -> Result<git2::Commit<'repo>, String> {
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

pub fn repo_info(repo: &Repository) -> Result<RepoInfo, String> {
    let workdir = repo
        .workdir()
        .or_else(|| repo.path().parent())
        .ok_or_else(|| "Repository has no working directory".to_string())?;
    let path = workdir.to_string_lossy().to_string();
    let name = workdir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repository")
        .to_string();
    let head_branch = current_branch_name(repo)?;
    let default_base = detect_default_base_name(repo);

    Ok(RepoInfo {
        path,
        name,
        head_branch,
        default_base,
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
