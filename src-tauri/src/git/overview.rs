use git2::{Diff, DiffDelta, DiffOptions, Repository, StatusOptions};
use std::collections::{HashMap, HashSet};

use super::comparison::ResolvedComparison;
use super::repo::current_branch_name;
use super::types::{BranchOverview, ChangedFile, FileBadge};

pub(crate) fn build_branch_overview(
    repo: &Repository,
    comparison: &ResolvedComparison<'_>,
) -> Result<BranchOverview, String> {
    let repo_path = repo
        .workdir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| repo.path().to_string_lossy().to_string());

    let mut file_map: HashMap<String, ChangedFile> = HashMap::new();
    let mut committed_paths: HashSet<String> = HashSet::new();

    if comparison.head_tree.is_some() {
        let committed_diff = repo
            .diff_tree_to_tree(
                comparison.old_tree.as_ref(),
                comparison.head_tree.as_ref(),
                None,
            )
            .map_err(|e| e.to_string())?;
        for_each_diff_path(&committed_diff, |path| {
            committed_paths.insert(path.clone());
            // Live new-side is the working tree, not HEAD. Files that differ in
            // the commit but match the merge-base on disk are not in this
            // comparison; don't seed them from the committed tree-to-tree.
            if !comparison.is_live() {
                insert_file(&mut file_map, path, Some(FileBadge::Committed));
            }
        });
    }

    if comparison.is_live() {
        collect_working_tree(repo, comparison, &mut file_map)?;
        for path in &committed_paths {
            if let Some(record) = file_map.get_mut(path) {
                push_badge(&mut record.badges, FileBadge::Committed);
            }
        }
    }

    let mut files: Vec<ChangedFile> = file_map.into_values().collect();
    for file in &mut files {
        file.badges.sort();
        file.badges.dedup();
        if file.badges.is_empty() {
            if committed_paths.contains(&file.path) || !comparison.is_live() {
                push_badge(&mut file.badges, FileBadge::Committed);
            } else {
                push_badge(&mut file.badges, FileBadge::Unstaged);
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(BranchOverview {
        repo_path,
        current_branch: current_branch_name(repo)?,
        base_branch: comparison.base_label.clone(),
        merge_base: comparison.merge_base_label.clone(),
        head_oid: comparison.head_oid.clone(),
        is_live: comparison.is_live(),
        files,
    })
}

/// Live file list is merge-base → workdir (with untracked). Status is
/// badge-only: `git status` is vs HEAD, so using it to *add* paths pulls in
/// files with no workdir delta: empty patches, stuck "Showing X of Y".
fn collect_working_tree(
    repo: &Repository,
    comparison: &ResolvedComparison<'_>,
    file_map: &mut HashMap<String, ChangedFile>,
) -> Result<(), String> {
    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(true);
    diff_opts.recurse_untracked_dirs(true);

    // Not `*_with_index`: that emulates `git diff <tree>` by merging
    // tree→index with index→workdir, and keeps paths whose *index* still
    // differs from the merge-base even when the workdir matches it (e.g. a
    // committed branch file restored on disk). Those produce empty patches
    // and stick the UI on "Showing X of Y". Live new-side is the workdir.
    let workdir_diff = repo
        .diff_tree_to_workdir(comparison.old_tree.as_ref(), Some(&mut diff_opts))
        .map_err(|e| e.to_string())?;
    for_each_diff_path(&workdir_diff, |path| {
        insert_file(file_map, path, None);
    });

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true);
    status_opts.recurse_untracked_dirs(true);
    status_opts.renames_head_to_index(true);
    status_opts.renames_index_to_workdir(true);

    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| e.to_string())?;

    for entry in statuses.iter() {
        let Some(path) = entry.path() else {
            continue;
        };
        let path = path.replace('\\', "/");
        let status = entry.status();

        if status.is_ignored() {
            continue;
        }

        let Some(record) = file_map.get_mut(&path) else {
            continue;
        };

        if status.is_wt_new() && !status.is_index_new() {
            push_badge(&mut record.badges, FileBadge::Untracked);
        }
        if status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
            || status.is_index_renamed()
            || status.is_index_typechange()
        {
            push_badge(&mut record.badges, FileBadge::Staged);
        }
        if status.is_wt_modified()
            || status.is_wt_deleted()
            || status.is_wt_renamed()
            || status.is_wt_typechange()
        {
            push_badge(&mut record.badges, FileBadge::Unstaged);
        }
    }

    Ok(())
}

fn insert_file(
    file_map: &mut HashMap<String, ChangedFile>,
    path: String,
    badge: Option<FileBadge>,
) {
    let record = file_map.entry(path.clone()).or_insert_with(|| ChangedFile {
        path,
        badges: Vec::new(),
        is_binary: false,
    });
    if let Some(badge) = badge {
        push_badge(&mut record.badges, badge);
    }
}

fn for_each_diff_path(diff: &Diff, mut visit: impl FnMut(String)) {
    let _ = diff.foreach(
        &mut |delta, _| {
            if let Some(path) = delta_path(&delta) {
                visit(path);
            }
            true
        },
        None,
        None,
        None,
    );
}

fn delta_path(delta: &DiffDelta) -> Option<String> {
    let path = if let Some(new) = delta.new_file().path() {
        new
    } else {
        delta.old_file().path()?
    };
    Some(path.to_string_lossy().replace('\\', "/"))
}

pub(crate) fn push_badge(badges: &mut Vec<FileBadge>, badge: FileBadge) {
    if !badges.contains(&badge) {
        badges.push(badge);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_badge_dedupes() {
        let mut badges = vec![];
        push_badge(&mut badges, FileBadge::Staged);
        push_badge(&mut badges, FileBadge::Staged);
        assert_eq!(badges, vec![FileBadge::Staged]);
    }
}
