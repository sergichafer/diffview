use git2::{Diff, DiffFlags, DiffOptions, ObjectType, Oid, Patch, Repository, Tree};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::comparison::ResolvedComparison;
use super::types::FileDiffResult;

/// One libgit2 diff for every path in the batch, then one result per path in
/// request order. Paths with no delta still get a result through the fallbacks.
pub(crate) fn file_diffs_for_paths(
    repo: &Repository,
    comparison: &ResolvedComparison<'_>,
    paths: &[String],
) -> Result<Vec<FileDiffResult>, String> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    let merge_base_tree = comparison.old_tree.as_ref();
    let live = comparison.is_live();

    let mut opts = DiffOptions::new();
    for path in paths {
        opts.pathspec(path);
    }
    opts.disable_pathspec_match(true);
    if live {
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);
        opts.show_untracked_content(true);
    }

    // Live: merge-base tree → workdir (untracked included). Index is not the
    // new side; a staged blob restored to the merge-base is not a live change.
    // No find_similar: pairing would depend on which paths share the batch.
    // Live `old_path` comes from the merge-base to HEAD rename map below;
    // committed mode reports none.
    let diff = if live {
        repo.diff_tree_to_workdir(merge_base_tree, Some(&mut opts))
    } else {
        repo.diff_tree_to_tree(merge_base_tree, comparison.head_tree.as_ref(), Some(&mut opts))
    }
    .map_err(|e| e.to_string())?;

    let deltas = deltas_by_path(&diff);
    // Live mode reports a rename committed between the merge base and HEAD.
    // The HEAD tree is read once per batch; the rename map only when needed.
    let head_tree = if live { head_commit_tree(repo) } else { None };
    let mut committed_renames: Option<HashMap<String, String>> = None;

    paths
        .iter()
        .map(|path| {
            let entry = deltas.get(path.as_str());
            let indices = entry.map(|e| e.indices.as_slice()).unwrap_or(&[]);
            let is_binary = entry.is_some_and(|e| e.is_binary);
            if live {
                let old_path = match head_tree.as_ref() {
                    Some(head) if may_be_rename_target(merge_base_tree, head, path) => {
                        committed_renames
                            .get_or_insert_with(|| renames_to_head(repo, merge_base_tree, head))
                            .get(path.as_str())
                            .cloned()
                    }
                    _ => None,
                };
                file_diff_workdir(repo, merge_base_tree, &diff, indices, is_binary, old_path, path)
            } else {
                file_diff_tree_to_tree(
                    repo,
                    merge_base_tree,
                    comparison.head_tree.as_ref(),
                    &diff,
                    indices,
                    is_binary,
                    path,
                )
            }
        })
        .collect()
}

#[derive(Default)]
struct PathDeltas {
    indices: Vec<usize>,
    is_binary: bool,
}

/// Delta indices and binary flag per path, in one pass over the diff.
fn deltas_by_path(diff: &Diff) -> HashMap<String, PathDeltas> {
    let mut by_path: HashMap<String, PathDeltas> = HashMap::new();
    let mut index = 0;
    let _ = diff.foreach(
        &mut |delta, _| {
            if let Some(path) = delta_path(&delta) {
                let entry = by_path.entry(path).or_default();
                entry.indices.push(index);
                entry.is_binary |= delta.flags().contains(DiffFlags::BINARY);
            }
            index += 1;
            true
        },
        None,
        None,
        None,
    );
    by_path
}

fn file_diff_workdir(
    repo: &Repository,
    merge_base_tree: Option<&Tree<'_>>,
    diff: &Diff,
    indices: &[usize],
    mut is_binary: bool,
    old_path: Option<String>,
    path: &str,
) -> Result<FileDiffResult, String> {
    // libgit2 emits `new file mode` / `--- /dev/null` for staged additions and a
    // change-from-empty form for untracked. The renderer collapses the "new" form
    // to one column, so split/unified toggling no-ops on staged new files.
    // Normalize every new file (no old_path) to the change-from-empty form.
    let is_new_file = old_path.is_none() && !file_exists_in_tree(merge_base_tree, path);

    let mut patch = if is_binary {
        RenderedPatch::default()
    } else if is_new_file {
        patch_between_trees(repo, merge_base_tree, None, path)?
    } else {
        deltas_to_patch(diff, indices)?
    };

    if patch.text.trim().is_empty() {
        if is_binary || workdir_file_is_non_text(repo, path) {
            is_binary = true;
            patch = RenderedPatch::uncounted(display_patch_for_binary(path, old_path.as_deref()));
        } else {
            patch = patch_between_trees(repo, merge_base_tree, None, path)?;
        }
    }

    Ok(patch.into_result(path, is_binary, old_path))
}

fn file_diff_tree_to_tree(
    repo: &Repository,
    merge_base_tree: Option<&Tree<'_>>,
    head_tree: Option<&Tree<'_>>,
    diff: &Diff,
    indices: &[usize],
    is_binary: bool,
    path: &str,
) -> Result<FileDiffResult, String> {
    let mut patch = if is_binary {
        RenderedPatch::default()
    } else {
        deltas_to_patch(diff, indices)?
    };

    if patch.text.trim().is_empty() {
        if is_binary {
            patch = RenderedPatch::uncounted(display_patch_for_binary(path, None));
        } else {
            patch = patch_between_trees(repo, merge_base_tree, head_tree, path)?;
        }
    }

    Ok(patch.into_result(path, is_binary, None))
}

/// Patch text plus the line counts libgit2 computed while rendering it.
#[derive(Default)]
struct RenderedPatch {
    text: String,
    additions: u32,
    deletions: u32,
}

impl RenderedPatch {
    /// Placeholder text with no diff lines (binary or empty-file headers).
    fn uncounted(text: String) -> Self {
        Self {
            text,
            additions: 0,
            deletions: 0,
        }
    }

    fn add_stats(&mut self, patch: &Patch) -> Result<(), String> {
        let (_, additions, deletions) = patch.line_stats().map_err(|e| e.to_string())?;
        self.additions += u32::try_from(additions).unwrap_or(u32::MAX);
        self.deletions += u32::try_from(deletions).unwrap_or(u32::MAX);
        Ok(())
    }

    fn into_result(self, path: &str, is_binary: bool, old_path: Option<String>) -> FileDiffResult {
        FileDiffResult {
            path: path.to_string(),
            patch: self.text,
            is_binary,
            old_path,
            additions: self.additions,
            deletions: self.deletions,
        }
    }
}

fn display_patch_for_binary(path: &str, old_path: Option<&str>) -> String {
    let old = old_path.unwrap_or(path);
    format!("diff --git a/{old} b/{path}\nBinary files a/{old} and b/{path} differ\n")
}

/// Parseable git diff for an add/delete of a zero-byte file. `Patch::from_buffers`
/// emits nothing when both sides are empty, which the frontend then skips.
fn display_patch_for_empty_file(path: &str) -> String {
    format!("diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n")
}

const CONFLICT_MSG: &str = "conflict: working-tree file changed since hydration";

/// Working-file reads and writes need a checkout. A bare repository's path is
/// its git dir, so a write there would land among refs and objects.
pub fn require_working_tree(repo: &Repository) -> Result<(), String> {
    if repo.is_bare() || repo.workdir().is_none() {
        return Err("Remote workspaces have no working tree".into());
    }
    Ok(())
}

pub fn read_working_file(repo_path: &str, path: &str) -> Result<String, String> {
    let full = resolve_repo_relative_path(repo_path, path)?;
    let bytes =
        std::fs::read(&full).map_err(|e| format!("Failed to read {}: {e}", full.display()))?;
    String::from_utf8(bytes)
        .map_err(|_| format!("Failed to read {}: file is not valid UTF-8", full.display()))
}

/// Compare-and-swap write. `None`: file must be absent. `Some(s)`: on-disk
/// UTF-8 contents must already equal `s` (including empty).
pub fn write_working_file(
    repo_path: &str,
    path: &str,
    contents: &str,
    expected: Option<&str>,
) -> Result<(), String> {
    let full = resolve_repo_relative_path(repo_path, path)?;

    match expected {
        None => {
            if full.exists() {
                return Err(CONFLICT_MSG.into());
            }
        }
        Some(expected_contents) => {
            if !full.is_file() {
                return Err(CONFLICT_MSG.into());
            }
            let bytes = std::fs::read(&full)
                .map_err(|e| format!("Failed to read {}: {e}", full.display()))?;
            let current = String::from_utf8(bytes).map_err(|_| {
                format!("Failed to read {}: file is not valid UTF-8", full.display())
            })?;
            if current != expected_contents {
                return Err(CONFLICT_MSG.into());
            }
        }
    }

    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dirs for {}: {e}", full.display()))?;
    }
    std::fs::write(&full, contents.as_bytes())
        .map_err(|e| format!("Failed to write {}: {e}", full.display()))
}

/// Reject paths that escape the repo root. For missing targets, canonicalize
/// the nearest existing ancestor so `link → /outside` + `link/new.txt` is closed.
fn resolve_repo_relative_path(repo_path: &str, path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path must not be empty".into());
    }
    let rel = Path::new(trimmed);
    if rel.is_absolute() {
        return Err("Path must be repository-relative".into());
    }
    for component in rel.components() {
        match component {
            std::path::Component::Normal(_) => {}
            std::path::Component::CurDir => {}
            _ => return Err("Path must not contain '..' or prefixes".into()),
        }
    }

    let root = PathBuf::from(repo_path)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve repo path: {e}"))?;
    let full = root.join(rel);
    if full.exists() {
        let canonical = full
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {e}"))?;
        if !canonical.starts_with(&root) {
            return Err("Path escapes repository root".into());
        }
        return Ok(canonical);
    }

    let mut current = full.clone();
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if current.exists() {
            break;
        }
        if current == root {
            return Err("Path escapes repository root".into());
        }
        let name = current
            .file_name()
            .ok_or_else(|| "Path escapes repository root".to_string())?
            .to_owned();
        missing.push(name);
        current = current
            .parent()
            .ok_or_else(|| "Path escapes repository root".to_string())?
            .to_path_buf();
    }

    let canonical_base = current
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))?;
    if !canonical_base.starts_with(&root) {
        return Err("Path escapes repository root".into());
    }

    let mut resolved = canonical_base;
    for component in missing.into_iter().rev() {
        resolved.push(component);
    }
    Ok(resolved)
}

/// Strict UTF-8 on both sides so invalid bytes never become a write baseline.
pub(crate) fn comparison_file_contents(
    repo: &Repository,
    comparison: &ResolvedComparison<'_>,
    path: &str,
    old_path: Option<&str>,
) -> Result<super::types::ComparisonFileContents, String> {
    let old_key = old_path.unwrap_or(path);
    let old = match comparison.old_tree.as_ref() {
        Some(tree) => tree_file_content_strict(repo, tree, old_key)?,
        None => None,
    };

    let new = if comparison.is_live() {
        match repo.workdir() {
            Some(root) => {
                let full = root.join(path);
                if full.is_file() {
                    let bytes = std::fs::read(&full)
                        .map_err(|e| format!("Failed to read {}: {e}", full.display()))?;
                    let oid = Oid::hash_object(ObjectType::Blob, &bytes)
                        .map_err(|e| e.to_string())?;
                    let text = String::from_utf8(bytes).map_err(|_| {
                        format!("Failed to read {}: file is not valid UTF-8", full.display())
                    })?;
                    Some((text, oid))
                } else {
                    None
                }
            }
            None => None,
        }
    } else {
        match comparison.head_tree.as_ref() {
            Some(tree) => tree_file_content_strict(repo, tree, path)?,
            None => None,
        }
    };

    let (old, old_oid) = split_blob(old);
    let (new, new_oid) = split_blob(new);
    Ok(super::types::ComparisonFileContents {
        old,
        new,
        old_oid,
        new_oid,
    })
}

fn split_blob(blob: Option<(String, Oid)>) -> (Option<String>, Option<String>) {
    match blob {
        Some((text, oid)) => (Some(text), Some(oid.to_string())),
        None => (None, None),
    }
}

fn head_commit_tree(repo: &Repository) -> Option<Tree<'_>> {
    repo.head().ok()?.peel_to_commit().ok()?.tree().ok()
}

/// Entry type as libgit2 compares it: a change between these splits into a
/// delete plus an add. The exec bit stays within `File`.
#[derive(PartialEq, Eq)]
enum EntryType {
    File,
    Link,
    Submodule,
    Directory,
}

fn entry_type(tree: Option<&Tree<'_>>, path: &str) -> Option<EntryType> {
    let entry = tree?.get_path(Path::new(path)).ok()?;
    Some(match entry.filemode() {
        0o120000 => EntryType::Link,
        0o160000 => EntryType::Submodule,
        0o040000 => EntryType::Directory,
        _ => EntryType::File,
    })
}

/// Rename detection between the merge base and HEAD pairs only added
/// entries. A path is added there when HEAD holds a non-directory entry at it
/// and the merge base holds nothing or an entry of another type (a typechange,
/// or a directory replaced by a file). Any other path keeps `old_path` None.
fn may_be_rename_target(merge_base_tree: Option<&Tree<'_>>, head_tree: &Tree<'_>, path: &str) -> bool {
    match entry_type(Some(head_tree), path) {
        None | Some(EntryType::Directory) => false,
        Some(head) => entry_type(merge_base_tree, path) != Some(head),
    }
}

/// New path → old path for every rename between the merge base and HEAD.
/// Built at most once per batch, and only when a batch path may be a target.
fn renames_to_head(
    repo: &Repository,
    merge_base_tree: Option<&Tree<'_>>,
    head_tree: &Tree<'_>,
) -> HashMap<String, String> {
    let mut renames = HashMap::new();
    let Ok(mut diff) = repo.diff_tree_to_tree(merge_base_tree, Some(head_tree), None) else {
        return renames;
    };
    let mut find_opts = git2::DiffFindOptions::new();
    if diff.find_similar(Some(&mut find_opts)).is_err() {
        return renames;
    }
    let _ = diff.foreach(
        &mut |delta, _| {
            if let (Some(new), Some(old)) = (delta_path(&delta), delta.old_file().path()) {
                let old = old.to_string_lossy().replace('\\', "/");
                if old != new {
                    renames.insert(new, old);
                }
            }
            true
        },
        None,
        None,
        None,
    );
    renames
}

fn delta_path(delta: &git2::DiffDelta) -> Option<String> {
    let path = if let Some(new) = delta.new_file().path() {
        new
    } else {
        delta.old_file().path()?
    };
    Some(path.to_string_lossy().replace('\\', "/"))
}

fn deltas_to_patch(diff: &Diff, indices: &[usize]) -> Result<RenderedPatch, String> {
    let mut output = Vec::new();
    let mut rendered = RenderedPatch::default();
    for &i in indices {
        let Some(mut patch) = Patch::from_diff(diff, i).map_err(|e| e.to_string())? else {
            continue;
        };
        rendered.add_stats(&patch)?;
        let buf = patch.to_buf().map_err(|e| e.to_string())?;
        output.extend_from_slice(&buf);
    }
    rendered.text = String::from_utf8_lossy(&output).into_owned();
    Ok(rendered)
}

/// Missing base tree (empty repo) means every path is new.
fn file_exists_in_tree(tree: Option<&Tree<'_>>, path: &str) -> bool {
    match tree {
        Some(tree) => tree.get_path(Path::new(path)).is_ok(),
        None => false,
    }
}

/// Lossy decode for patch-generation / display-only paths.
fn tree_file_content(repo: &Repository, tree: &Tree, path: &str) -> Option<String> {
    let entry = tree.get_path(Path::new(path)).ok()?;
    if entry.kind() != Some(ObjectType::Blob) {
        return None;
    }
    let blob = repo.find_blob(entry.id()).ok()?;
    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

/// Strict UTF-8 for edit hydration, with the blob id. Missing path → `Ok(None)`;
/// invalid UTF-8 → `Err`.
fn tree_file_content_strict(
    repo: &Repository,
    tree: &Tree,
    path: &str,
) -> Result<Option<(String, Oid)>, String> {
    let entry = match tree.get_path(Path::new(path)) {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };
    if entry.kind() != Some(ObjectType::Blob) {
        return Ok(None);
    }
    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Failed to read blob for {path}: {e}"))?;
    match String::from_utf8(blob.content().to_vec()) {
        Ok(s) => Ok(Some((s, entry.id()))),
        Err(_) => Err(format!("File {path} is not valid UTF-8")),
    }
}

fn workdir_file_is_non_text(repo: &Repository, path: &str) -> bool {
    matches!(read_workdir_text(repo, path), WorkdirText::NonText)
}

enum WorkdirText {
    Missing,
    Text(String),
    NonText,
}

fn read_workdir_text(repo: &Repository, path: &str) -> WorkdirText {
    let Some(root) = repo.workdir() else {
        return WorkdirText::Missing;
    };
    let full = root.join(path);
    if !full.is_file() {
        return WorkdirText::Missing;
    }
    match std::fs::read(&full) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => WorkdirText::Text(text),
            Err(_) => WorkdirText::NonText,
        },
        Err(_) => WorkdirText::Missing,
    }
}

/// Fallback patch from raw contents; `new_tree`, or workdir when `None` (live).
fn patch_between_trees(
    repo: &Repository,
    old_tree: Option<&Tree<'_>>,
    new_tree: Option<&Tree<'_>>,
    path: &str,
) -> Result<RenderedPatch, String> {
    let old = old_tree.and_then(|t| tree_file_content(repo, t, path));
    let new = match new_tree {
        Some(tree) => tree_file_content(repo, tree, path),
        None => match read_workdir_text(repo, path) {
            WorkdirText::Text(text) => Some(text),
            WorkdirText::Missing | WorkdirText::NonText => None,
        },
    };

    match (&old, &new) {
        (None, None) => return Ok(RenderedPatch::default()),
        (Some(left), Some(right)) if left == right => return Ok(RenderedPatch::default()),
        (None, Some(text)) | (Some(text), None) if text.is_empty() => {
            return Ok(RenderedPatch::uncounted(display_patch_for_empty_file(path)));
        }
        _ => {}
    }

    let old_bytes = old.as_deref().unwrap_or("");
    let new_bytes = new.as_deref().unwrap_or("");

    let path_obj = Path::new(path);
    let mut opts = DiffOptions::new();
    opts.force_text(true);

    let mut patch = Patch::from_buffers(
        old_bytes.as_bytes(),
        Some(path_obj),
        new_bytes.as_bytes(),
        Some(path_obj),
        Some(&mut opts),
    )
    .map_err(|e| e.to_string())?;

    let buf = patch.to_buf().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    if text.trim().is_empty() {
        return Ok(RenderedPatch::uncounted(display_patch_for_empty_file(path)));
    }
    let mut rendered = RenderedPatch::uncounted(text);
    rendered.add_stats(&patch)?;
    Ok(rendered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn display_patch_for_binary_includes_paths() {
        let patch = display_patch_for_binary("img.png", None);
        assert!(patch.contains("Binary files"));
        assert!(patch.contains("img.png"));
    }

    #[test]
    fn display_patch_for_empty_file_is_parseable_git_diff() {
        let patch = display_patch_for_empty_file("empty.txt");
        assert!(patch.starts_with("diff --git a/empty.txt b/empty.txt\n"));
        assert!(patch.contains("--- a/empty.txt"));
        assert!(patch.contains("+++ b/empty.txt"));
    }

    #[test]
    fn resolve_rejects_parent_dir_and_absolute() {
        let root = std::env::temp_dir().join(format!(
            "diffview-path-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root_str = root.to_string_lossy().into_owned();
        assert!(resolve_repo_relative_path(&root_str, "../escape.txt").is_err());
        assert!(resolve_repo_relative_path(&root_str, "/etc/passwd").is_err());
        assert!(resolve_repo_relative_path(&root_str, "").is_err());
        let ok = resolve_repo_relative_path(&root_str, "src/a.ts").unwrap();
        assert!(ok.starts_with(root.canonicalize().unwrap()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_rejects_symlink_parent_escape() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("diffview-symlink-root-{stamp}"));
        let outside = std::env::temp_dir().join(format!("diffview-symlink-out-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let link = root.join("link");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        #[cfg(not(unix))]
        {
            let _ = fs::remove_dir_all(&root);
            let _ = fs::remove_dir_all(&outside);
            return;
        }
        let root_str = root.to_string_lossy().into_owned();
        let err = resolve_repo_relative_path(&root_str, "link/new.txt").unwrap_err();
        assert!(
            err.contains("escapes"),
            "expected symlink escape rejection, got {err}"
        );
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn require_working_tree_refuses_a_bare_repository() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let bare_dir = std::env::temp_dir().join(format!("diffview-bare-{stamp}"));
        let work_dir = std::env::temp_dir().join(format!("diffview-work-{stamp}"));
        let bare = Repository::init_bare(&bare_dir).unwrap();
        let work = Repository::init(&work_dir).unwrap();
        assert_eq!(
            require_working_tree(&bare).unwrap_err(),
            "Remote workspaces have no working tree"
        );
        assert!(require_working_tree(&work).is_ok());
        let _ = fs::remove_dir_all(&bare_dir);
        let _ = fs::remove_dir_all(&work_dir);
    }

    #[test]
    fn write_working_file_creates_parents() {
        let root = std::env::temp_dir().join(format!(
            "diffview-write-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root_str = root.to_string_lossy().into_owned();
        write_working_file(&root_str, "nested/dir/file.ts", "hello\n", None).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("nested/dir/file.ts")).unwrap(),
            "hello\n"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn write_working_file_cas_match_and_mismatch() {
        let root = std::env::temp_dir().join(format!(
            "diffview-cas-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root_str = root.to_string_lossy().into_owned();
        let path = root.join("file.txt");
        fs::write(&path, "baseline\n").unwrap();

        write_working_file(&root_str, "file.txt", "next\n", Some("baseline\n")).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "next\n");

        let err =
            write_working_file(&root_str, "file.txt", "stolen\n", Some("baseline\n")).unwrap_err();
        assert!(err.contains("conflict"), "got {err}");
        assert_eq!(fs::read_to_string(&path).unwrap(), "next\n");

        write_working_file(&root_str, "brand-new.txt", "created\n", None).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("brand-new.txt")).unwrap(),
            "created\n"
        );
        let absent_conflict =
            write_working_file(&root_str, "brand-new.txt", "x\n", None).unwrap_err();
        assert!(absent_conflict.contains("conflict"));

        let _ = fs::remove_dir_all(&root);
    }
}
