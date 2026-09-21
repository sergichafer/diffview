//! First-parent commits reachable from the resolved head and not from the merge-base.
//! Newest first. The merge-base itself is not included.

use git2::{Oid, Repository, Sort};
use serde::Serialize;
use typeshare::typeshare;

use super::comparison::{resolve_comparison, EMPTY_TREE_OID};

const HISTORY_CAP: usize = 200;

/// One commit on the head side of the merge-base. Newest commits come first.
#[typeshare]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommit {
    pub oid: String,
    pub short: String,
    pub subject: String,
    /// First parent. Absent when the commit has none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    /// Commit time, Unix seconds (UTC).
    #[typeshare(serialized_as = "I54")]
    pub time: i64,
}

/// First-parent commits reachable from head and not from the merge-base.
#[typeshare]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryLane {
    pub merge_base: String,
    pub head_oid: String,
    pub commits: Vec<HistoryCommit>,
    pub truncated: bool,
}

pub fn history_lane(
    repo: &Repository,
    base_branch: &str,
    head_branch: &str,
) -> Result<HistoryLane, String> {
    let resolved = resolve_comparison(repo, base_branch, head_branch)?;
    let head_label = resolved.head_oid.clone();
    let merge_label = resolved.merge_base_label.clone();

    if merge_label == EMPTY_TREE_OID || head_label == EMPTY_TREE_OID {
        return Ok(HistoryLane {
            merge_base: merge_label,
            head_oid: head_label,
            commits: Vec::new(),
            truncated: false,
        });
    }

    let head_oid = Oid::from_str(&head_label).map_err(|e| e.to_string())?;
    let merge_oid = Oid::from_str(&merge_label).map_err(|e| e.to_string())?;

    if head_oid == merge_oid {
        return Ok(HistoryLane {
            merge_base: merge_label,
            head_oid: head_label,
            commits: Vec::new(),
            truncated: false,
        });
    }

    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.push(head_oid).map_err(|e| e.to_string())?;
    walk.hide(merge_oid).map_err(|e| e.to_string())?;
    walk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
    walk.simplify_first_parent().map_err(|e| e.to_string())?;

    let mut commits = Vec::new();
    let mut truncated = false;
    for oid in walk {
        let oid = oid.map_err(|e| e.to_string())?;
        if commits.len() == HISTORY_CAP {
            truncated = true;
            break;
        }
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let parent = commit.parent_id(0).ok().map(|id| id.to_string());
        let full = oid.to_string();
        let short = full.chars().take(7).collect();
        commits.push(HistoryCommit {
            oid: full,
            short,
            subject: commit.summary().unwrap_or("").to_string(),
            parent,
            time: commit.time().seconds(),
        });
    }

    Ok(HistoryLane {
        merge_base: merge_label,
        head_oid: head_label,
        commits,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Signature, Time};
    use std::fs;
    use std::path::{Path, PathBuf};

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn init(tag: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "diffview-history-test-{tag}-{}",
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
            Self { path }
        }

        fn open(&self) -> Repository {
            Repository::open(&self.path).expect("open repo")
        }

        fn commit(&self, message: &str, seconds: i64) -> Oid {
            let repo = self.open();
            let file = self.path.join("note.txt");
            fs::write(&file, message).expect("write file");
            let mut index = repo.index().expect("index");
            index.add_path(Path::new("note.txt")).expect("add path");
            index.write().expect("write index");
            let tree_id = repo.index().expect("index").write_tree().expect("tree");
            let tree = repo.find_tree(tree_id).expect("find tree");
            let sig = Signature::new(
                "Diffview Test",
                "test@diffview.local",
                &Time::new(seconds, 0),
            )
            .expect("signature");
            let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = parent.iter().collect();
            let update_ref = if parent.is_none() {
                "refs/heads/main"
            } else {
                "HEAD"
            };
            let oid = repo
                .commit(
                    Some(update_ref),
                    &sig,
                    &sig,
                    message,
                    &tree,
                    parents.as_slice(),
                )
                .expect("commit");
            if parent.is_none() {
                repo.set_head("refs/heads/main").expect("set head");
            }
            oid
        }

        fn commit_with_parents(
            &self,
            message: &str,
            seconds: i64,
            parent_oids: &[Oid],
            update_ref: &str,
        ) -> Oid {
            let repo = self.open();
            let file = self.path.join("note.txt");
            fs::write(&file, message).expect("write file");
            let mut index = repo.index().expect("index");
            index.add_path(Path::new("note.txt")).expect("add path");
            index.write().expect("write index");
            let tree_id = repo.index().expect("index").write_tree().expect("tree");
            let tree = repo.find_tree(tree_id).expect("find tree");
            let sig = Signature::new(
                "Diffview Test",
                "test@diffview.local",
                &Time::new(seconds, 0),
            )
            .expect("signature");
            let commits: Vec<git2::Commit> = parent_oids
                .iter()
                .map(|oid| repo.find_commit(*oid).expect("parent"))
                .collect();
            let parents: Vec<&git2::Commit> = commits.iter().collect();
            repo.commit(Some(update_ref), &sig, &sig, message, &tree, &parents)
                .expect("commit")
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn ahead_commits_are_newest_first_and_exclude_the_merge_base() {
        let fixture = TestRepo::init("lane");
        let base = fixture.commit("initial", 1_700_000_000);
        let repo = fixture.open();
        repo.branch(
            "feature",
            &repo.find_commit(base).unwrap(),
            false,
        )
        .unwrap();
        repo.set_head("refs/heads/feature").unwrap();
        fixture.commit("one", 1_700_000_100);
        fixture.commit("two", 1_700_000_200);
        let tip = fixture.commit("three", 1_700_000_300);

        let lane = history_lane(&fixture.open(), "main", "feature").expect("lane");
        assert_eq!(lane.head_oid, tip.to_string());
        assert_eq!(lane.merge_base, base.to_string());
        assert!(!lane.truncated);
        assert_eq!(
            lane.commits
                .iter()
                .map(|c| c.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["three", "two", "one"]
        );
        assert_eq!(lane.commits[0].parent.as_deref(), Some(lane.commits[1].oid.as_str()));
        assert_eq!(lane.commits[1].parent.as_deref(), Some(lane.commits[2].oid.as_str()));
        assert_eq!(lane.commits[2].parent.as_deref(), Some(base.to_string().as_str()));
        assert!(lane.commits.iter().all(|c| c.short.len() == 7));
        assert!(lane.commits.iter().all(|c| c.oid != base.to_string()));
    }

    #[test]
    fn in_sync_lane_is_empty() {
        let fixture = TestRepo::init("sync");
        let base = fixture.commit("initial", 1_700_000_000);
        let lane = history_lane(&fixture.open(), "main", "main").expect("lane");
        assert!(lane.commits.is_empty());
        assert_eq!(lane.head_oid, base.to_string());
        assert_eq!(lane.merge_base, base.to_string());
        assert!(!lane.truncated);
    }

    #[test]
    fn merge_lane_keeps_the_first_parent_chain_and_hides_the_side_branch() {
        let fixture = TestRepo::init("merge");
        let base = fixture.commit("initial", 1_700_000_000);
        let repo = fixture.open();
        repo.branch("feature", &repo.find_commit(base).unwrap(), false)
            .unwrap();
        repo.set_head("refs/heads/feature").unwrap();
        let one = fixture.commit("one", 1_700_000_100);

        let repo = fixture.open();
        repo.branch("side", &repo.find_commit(one).unwrap(), false)
            .unwrap();
        repo.set_head("refs/heads/side").unwrap();
        let side = fixture.commit("side", 1_700_000_150);

        let repo = fixture.open();
        repo.set_head("refs/heads/feature").unwrap();
        fixture.commit_with_parents("merge", 1_700_000_180, &[one, side], "HEAD");
        fixture.commit("after", 1_700_000_200);

        let lane = history_lane(&fixture.open(), "main", "feature").expect("lane");
        assert_eq!(
            lane.commits
                .iter()
                .map(|c| c.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["after", "merge", "one"]
        );
        assert!(lane.commits.iter().all(|c| c.oid != side.to_string()));
        let merge = lane
            .commits
            .iter()
            .find(|c| c.subject == "merge")
            .expect("merge");
        assert_eq!(merge.parent.as_deref(), Some(one.to_string().as_str()));
        assert!(!lane.truncated);
    }
}
