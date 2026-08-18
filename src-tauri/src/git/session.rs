use git2::Repository;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::comparison::ResolutionCache;
use super::repo::{discover_repo, list_branch_names, repo_info};
use super::types::OpenRepoResult;

struct RepoSlot {
    repo: Repository,
    resolutions: ResolutionCache,
}

pub struct RepoRegistry {
    repos: Mutex<HashMap<String, Arc<Mutex<RepoSlot>>>>,
}

impl RepoRegistry {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
        }
    }
}

pub fn with_repo<F, R>(state: &RepoRegistry, repo_path: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&Repository) -> Result<R, String>,
{
    with_slot(state, repo_path, |repo, _cache| f(repo))
}

pub fn with_slot<F, R>(state: &RepoRegistry, repo_path: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&Repository, &mut ResolutionCache) -> Result<R, String>,
{
    let handle = {
        let guard = state.repos.lock().map_err(|e| e.to_string())?;
        guard
            .get(repo_path)
            .cloned()
            .ok_or_else(|| format!("No repository is open: {repo_path}"))?
    };
    let mut guard = handle.lock().map_err(|e| e.to_string())?;
    // MutexGuard only DerefMuts; field split-borrow needs a real &mut RepoSlot.
    run_with_slot(&mut guard, f)
}

fn run_with_slot<F, R>(slot: &mut RepoSlot, f: F) -> Result<R, String>
where
    F: FnOnce(&Repository, &mut ResolutionCache) -> Result<R, String>,
{
    f(&slot.repo, &mut slot.resolutions)
}

pub fn open(state: &RepoRegistry, path: &str) -> Result<OpenRepoResult, String> {
    let repo = discover_repo(path)?;
    let info = repo_info(&repo)?;
    let branches = list_branch_names(&repo)?;
    let repo_path = info.path.clone();

    let mut repos = state.repos.lock().map_err(|e| e.to_string())?;
    repos.insert(
        repo_path,
        Arc::new(Mutex::new(RepoSlot {
            repo,
            resolutions: ResolutionCache::default(),
        })),
    );

    Ok(OpenRepoResult { repo: info, branches })
}

pub fn close(state: &RepoRegistry, repo_path: &str) -> Result<(), String> {
    let mut repos = state.repos.lock().map_err(|e| e.to_string())?;
    repos.remove(repo_path);
    Ok(())
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
                "diffview-lib-test-{tag}-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).expect("create temp repo dir");
            let repo = Repository::init(&path).expect("init repo");
            let mut config = repo.config().expect("config");
            config.set_str("user.name", "Diffview Test").expect("user.name");
            config
                .set_str("user.email", "test@diffview.local")
                .expect("user.email");
            fs::write(path.join("README.md"), "# hello\n").expect("write file");
            let mut index = repo.index().expect("index");
            index.add_path(Path::new("README.md")).expect("add path");
            index.write().expect("write index");
            let tree_id = repo.index().expect("index").write_tree().expect("tree");
            let tree = repo.find_tree(tree_id).expect("find tree");
            let sig = git2::Signature::now("Diffview Test", "test@diffview.local")
                .expect("signature");
            repo.commit(Some("refs/heads/main"), &sig, &sig, "initial", &tree, &[])
                .expect("commit");
            repo.set_head("refs/heads/main").expect("set head");
            Self { path }
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    /// Map holds several repos; commands resolve by canonical RepoInfo.path,
    /// the same key the frontend uses for workspace/comparison identity.
    #[test]
    fn holds_two_repos_open_simultaneously() {
        let a = TestRepo::init("a");
        let b = TestRepo::init("b");
        {
            let repo = Repository::open(&b.path).expect("open b");
            let head = repo
                .head()
                .expect("head")
                .peel_to_commit()
                .expect("commit");
            repo.branch("feature-b", &head, true).expect("branch");
        }

        let state = RepoRegistry::new();
        let opened_a = open(&state, a.path.to_str().unwrap()).expect("open a");
        let opened_b = open(&state, b.path.to_str().unwrap()).expect("open b");

        assert_ne!(opened_a.repo.path, opened_b.repo.path);
        assert_eq!(state.repos.lock().unwrap().len(), 2);

        let branches_a =
            with_repo(&state, &opened_a.repo.path, list_branch_names).expect("branches a");
        let branches_b =
            with_repo(&state, &opened_b.repo.path, list_branch_names).expect("branches b");
        assert!(branches_a.contains(&"main".to_string()));
        assert!(branches_b.contains(&"feature-b".to_string()));
        assert!(!branches_a.contains(&"feature-b".to_string()));

        // Identity is the canonical RepoInfo.path. A picker-style path that
        // differs (e.g. missing trailing slash) must not resolve; otherwise
        // frontend group/row lookups would split identity, which was the
        // "second workspace fails to load" regression.
        let raw = a.path.to_string_lossy().to_string();
        if raw != opened_a.repo.path {
            assert!(
                with_repo(&state, &raw, list_branch_names).is_err(),
                "non-canonical path must not resolve"
            );
        }

        state.repos.lock().unwrap().remove(&opened_a.repo.path);
        assert!(with_repo(&state, &opened_a.repo.path, list_branch_names).is_err());
        assert!(with_repo(&state, &opened_b.repo.path, list_branch_names).is_ok());
    }
}
