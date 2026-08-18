use git2::Repository;

use super::repo::{
    current_branch_name, list_branch_names, normalize_base_branch, repo_info, resolve_commit,
};
use super::types::BranchMetadata;

/// Compare-palette rows vs `base_branch`. On demand; cost scales with branch count.
pub fn branch_metadata(
    repo: &Repository,
    base_branch: &str,
) -> Result<Vec<BranchMetadata>, String> {
    let base = normalize_base_branch(repo, base_branch);
    let base_oid = resolve_commit(repo, &base).ok().map(|c| c.id());
    let current = current_branch_name(repo).unwrap_or_default();
    let default_base = repo_info(repo).map(|i| i.default_base).unwrap_or_default();

    let mut metas: Vec<BranchMetadata> = Vec::new();
    for name in list_branch_names(repo)? {
        let Ok(commit) = resolve_commit(repo, &name) else {
            continue;
        };

        let (ahead, behind) = match base_oid {
            Some(base) => repo.graph_ahead_behind(commit.id(), base).unwrap_or((0, 0)),
            None => (0, 0),
        };

        let author = commit.author();
        let author_name = author.name().unwrap_or("").to_string();

        metas.push(BranchMetadata {
            name: name.clone(),
            ahead: ahead as u32,
            behind: behind as u32,
            last_subject: commit.summary().unwrap_or("").to_string(),
            author_initials: author_initials(&author_name),
            author: author_name,
            last_commit_time: commit.time().seconds(),
            is_default: name == default_base,
            is_current: name == current,
        });
    }

    metas.sort_by(|a, b| b.last_commit_time.cmp(&a.last_commit_time));
    Ok(metas)
}

fn author_initials(name: &str) -> String {
    let mut out = String::new();
    for part in name.split_whitespace().take(2) {
        if let Some(c) = part.chars().next() {
            out.extend(c.to_uppercase());
        }
    }
    if out.is_empty() {
        "?".to_string()
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::author_initials;

    #[test]
    fn initials_from_two_word_name() {
        assert_eq!(author_initials("Priya Nair"), "PN");
    }

    #[test]
    fn initials_from_single_word() {
        assert_eq!(author_initials("octocat"), "O");
    }

    #[test]
    fn initials_fallback_when_empty() {
        assert_eq!(author_initials("   "), "?");
    }
}
