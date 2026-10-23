//! Review folding from `.gitattributes`.
//!
//! A path marked `linguist-generated`, `-diff`, or `binary` starts collapsed,
//! the way forges render pull requests. Attributes come from the head side:
//! the working tree when live, the head commit's tree otherwise. libgit2
//! resolves nested `.gitattributes` files, `.git/info/attributes`, and macros.

use git2::{AttrCheckFlags, AttrValue, Index, Repository, Tree};

use super::comparison::ResolvedComparison;
use super::types::ChangedFile;

/// Sets `collapsed` on each file from the head side's attributes. Best effort:
/// a lookup failure leaves files expanded instead of failing the overview.
pub(crate) fn mark_collapsed(
    repo: &Repository,
    comparison: &ResolvedComparison<'_>,
    files: &mut [ChangedFile],
) {
    if files.is_empty() {
        return;
    }
    if comparison.is_live() {
        for file in files {
            file.collapsed =
                collapsed_by_attributes(repo, &file.path, AttrCheckFlags::FILE_THEN_INDEX);
        }
        return;
    }
    let Some(tree) = comparison.head_tree.as_ref() else {
        return;
    };
    let handle = match head_tree_handle(repo, tree) {
        Ok(handle) => handle,
        Err(e) => {
            eprintln!("Attribute lookup skipped: {e}");
            return;
        }
    };
    for file in files {
        file.collapsed = collapsed_by_attributes(&handle, &file.path, AttrCheckFlags::INDEX_ONLY);
    }
}

/// A separate handle whose index is the head tree, so lookups read that
/// commit's `.gitattributes` without touching the shared repository's index.
fn head_tree_handle(repo: &Repository, tree: &Tree<'_>) -> Result<Repository, git2::Error> {
    let handle = Repository::open(repo.path())?;
    let mut index = Index::new()?;
    index.read_tree(tree)?;
    handle.set_index(&mut index)?;
    Ok(handle)
}

fn collapsed_by_attributes(repo: &Repository, path: &str, flags: AttrCheckFlags) -> bool {
    let generated = repo
        .get_attr_bytes(path.as_ref(), "linguist-generated", flags)
        .ok()
        .flatten();
    if matches!(AttrValue::from_bytes(generated), AttrValue::True)
        || generated == Some(b"true".as_slice())
    {
        return true;
    }
    let diff = repo
        .get_attr_bytes(path.as_ref(), "diff", flags)
        .ok()
        .flatten();
    matches!(AttrValue::from_bytes(diff), AttrValue::False)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::comparison::resolve_comparison;
    use git2::{Oid, Signature};
    use std::fs;
    use std::path::{Path, PathBuf};

    struct TestRepo {
        dir: PathBuf,
        repo: Repository,
    }

    impl TestRepo {
        fn init(tag: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("diffview-attributes-{tag}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            let repo = Repository::init(&dir).unwrap();
            Self { dir, repo }
        }

        fn write(&self, path: &str, contents: &str) {
            let full = self.dir.join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, contents).unwrap();
        }

        fn commit_all(&self, message: &str) -> Oid {
            let mut index = self.repo.index().unwrap();
            index
                .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                .unwrap();
            index.write().unwrap();
            let tree = self.repo.find_tree(index.write_tree().unwrap()).unwrap();
            let sig = Signature::now("Test", "test@example.com").unwrap();
            let parents: Vec<_> = self
                .repo
                .head()
                .ok()
                .and_then(|h| h.peel_to_commit().ok())
                .into_iter()
                .collect();
            let parent_refs: Vec<_> = parents.iter().collect();
            self.repo
                .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
                .unwrap()
        }

        fn branch(&self, name: &str, oid: Oid) {
            let commit = self.repo.find_commit(oid).unwrap();
            self.repo.branch(name, &commit, true).unwrap();
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    fn file(path: &str) -> ChangedFile {
        ChangedFile {
            path: path.to_string(),
            badges: Vec::new(),
            is_binary: false,
            collapsed: false,
        }
    }

    fn collapsed(repo: &Repository, base: &str, head: &str, paths: &[&str]) -> Vec<String> {
        let comparison = resolve_comparison(repo, base, head).unwrap();
        let mut files: Vec<_> = paths.iter().map(|p| file(p)).collect();
        mark_collapsed(repo, &comparison, &mut files);
        files
            .into_iter()
            .filter(|f| f.collapsed)
            .map(|f| f.path)
            .collect()
    }

    const PATHS: [&str; 6] = [
        "src/main.rs",
        "Cargo.lock",
        "gen/api.ts",
        "gen/keep.ts",
        "assets/logo.svg",
        "vendor/lib.js",
    ];

    fn seed(t: &TestRepo) -> Oid {
        t.write("README.md", "base\n");
        t.commit_all("base")
    }

    fn write_attributes(t: &TestRepo) {
        t.write(
            ".gitattributes",
            "Cargo.lock linguist-generated=true\n*.svg binary\n",
        );
        t.write(
            "gen/.gitattributes",
            "*.ts linguist-generated\nkeep.ts -linguist-generated\n",
        );
        t.write("vendor/.gitattributes", "*.js -diff\n");
        for path in PATHS {
            t.write(path, "x\n");
        }
    }

    #[test]
    fn committed_head_reads_nested_attributes_from_the_head_tree() {
        let t = TestRepo::init("committed");
        let base = seed(&t);
        t.branch("main-base", base);
        write_attributes(&t);
        let head = t.commit_all("head");
        t.branch("feature", head);
        // Check out the base so the working tree has no attributes at all.
        t.repo.set_head("refs/heads/main-base").unwrap();
        t.repo
            .checkout_head(Some(
                git2::build::CheckoutBuilder::new()
                    .force()
                    .remove_untracked(true),
            ))
            .unwrap();
        assert!(!t.dir.join(".gitattributes").exists());

        let got = collapsed(&t.repo, "main-base", "feature", &PATHS);
        assert_eq!(
            got,
            vec![
                "Cargo.lock",
                "gen/api.ts",
                "assets/logo.svg",
                "vendor/lib.js"
            ]
        );
    }

    #[test]
    fn live_comparison_reads_working_tree_attributes() {
        let t = TestRepo::init("live");
        let base = seed(&t);
        t.branch("main-base", base);
        write_attributes(&t);

        let got = collapsed(&t.repo, "main-base", "", &PATHS);
        assert_eq!(
            got,
            vec![
                "Cargo.lock",
                "gen/api.ts",
                "assets/logo.svg",
                "vendor/lib.js"
            ]
        );
    }

    #[test]
    fn bare_clone_reads_attributes_from_the_head_tree() {
        let t = TestRepo::init("bare-src");
        let base = seed(&t);
        t.branch("main-base", base);
        write_attributes(&t);
        let head = t.commit_all("head");
        t.branch("feature", head);

        let bare_dir = t
            .dir
            .with_file_name(format!("diffview-attributes-bare-{}", std::process::id()));
        let _ = fs::remove_dir_all(&bare_dir);
        let bare = git2::build::RepoBuilder::new()
            .bare(true)
            .clone(&url_of(&t.dir), &bare_dir)
            .unwrap();
        let got = collapsed(&bare, "origin/main-base", "origin/feature", &PATHS);
        let _ = fs::remove_dir_all(&bare_dir);
        assert_eq!(
            got,
            vec![
                "Cargo.lock",
                "gen/api.ts",
                "assets/logo.svg",
                "vendor/lib.js"
            ]
        );
    }

    fn url_of(path: &Path) -> String {
        format!("file://{}", path.display())
    }
}
