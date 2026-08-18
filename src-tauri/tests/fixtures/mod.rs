use git2::{IndexAddOption, Repository, Signature};
use std::fs;
use std::path::{Path, PathBuf};

pub struct TestRepo {
    pub path: PathBuf,
    _repo: Repository,
}

impl TestRepo {
    pub fn init() -> Self {
        let path = std::env::temp_dir().join(format!(
            "diffview-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("create temp repo dir");
        let repo = Repository::init(&path).expect("init repo");
        configure_repo(&repo);
        Self { path, _repo: repo }
    }

    pub fn open(&self) -> Repository {
        Repository::open(&self.path).expect("open repo")
    }

    pub fn write(&self, rel: &str, content: &str) {
        let full = self.path.join(rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).expect("create parent dirs");
        }
        fs::write(&full, content).expect("write file");
    }

    pub fn add_all(&self) {
        let repo = self.open();
        let mut index = repo.index().expect("index");
        index
            .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .expect("add all");
        index.write().expect("write index");
    }

    pub fn add(&self, rel: &str) {
        let repo = self.open();
        let mut index = repo.index().expect("index");
        index.add_path(Path::new(rel)).expect("add path");
        index.write().expect("write index");
    }

    pub fn commit(&self, message: &str) {
        let repo = self.open();
        let sig = signature(&repo);
        let tree_id = repo
            .index()
            .expect("index")
            .write_tree()
            .expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        if let Some(parent) = parent {
            repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
                .expect("commit");
        } else {
            repo.commit(Some("refs/heads/main"), &sig, &sig, message, &tree, &[])
                .expect("initial commit");
            repo.set_head("refs/heads/main").expect("set head to main");
        }
    }

    pub fn checkout_new(&self, name: &str) {
        let repo = self.open();
        let head = repo.head().expect("head").peel_to_commit().expect("commit");
        repo.branch(name, &head, true).expect("create branch");
        repo.set_head(&format!("refs/heads/{name}"))
            .expect("set head");
        let obj = repo
            .revparse_single(&format!("refs/heads/{name}"))
            .expect("revparse branch");
        repo.checkout_tree(&obj, None).expect("checkout tree");
    }

    pub fn git_mv(&self, from: &str, to: &str) {
        std::process::Command::new("git")
            .args(["mv", from, to])
            .current_dir(&self.path)
            .status()
            .expect("git mv");
    }
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn configure_repo(repo: &Repository) {
    let mut config = repo.config().expect("config");
    config
        .set_str("user.name", "Diffview Test")
        .expect("user.name");
    config
        .set_str("user.email", "test@diffview.local")
        .expect("user.email");
}

fn signature(_repo: &Repository) -> Signature<'static> {
    Signature::now("Diffview Test", "test@diffview.local").expect("signature")
}
