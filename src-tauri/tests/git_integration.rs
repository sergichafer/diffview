mod fixtures;

use diffview_lib::git::{
    branch_metadata, list_branch_names, normalize_base_branch, repo_info, resolve_comparison_stamp,
    write_working_file, BranchOverview, ComparisonSpec, FileBadge, FileDiffResult, ResolutionCache,
};
use fixtures::TestRepo;

fn badges_for(overview: &BranchOverview, path: &str) -> Vec<FileBadge> {
    overview
        .files
        .iter()
        .find(|f| f.path == path)
        .map(|f| f.badges.clone())
        .unwrap_or_default()
}

fn overview(repo: &git2::Repository, base: &str, head: &str) -> BranchOverview {
    let mut cache = ResolutionCache::default();
    ComparisonSpec::overview(repo, &ComparisonSpec::new(base, head), &mut cache).expect("overview")
}

fn diffs(repo: &git2::Repository, base: &str, head: &str, paths: &[String]) -> Vec<FileDiffResult> {
    let mut cache = ResolutionCache::default();
    ComparisonSpec::file_diffs(repo, &ComparisonSpec::new(base, head), paths, &mut cache)
        .expect("diffs")
}

#[test]
fn empty_repo_no_changed_files() {
    let fixture = TestRepo::init();
    fixture.write("README.md", "# hello\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");

    assert_eq!(overview.current_branch, "feature");
    assert_eq!(overview.base_branch, "main");
    assert!(overview.files.is_empty());
}

/// Unborn HEAD (no commits / no branch refs): live working-tree vs empty tree.
/// Frontend sends `repo_info` defaults (`default_base` / `head_branch`) or an
/// empty head; both must populate the overview with staged/working files.
#[test]
fn unborn_repo_live_overview_shows_working_tree_files() {
    let fixture = TestRepo::init();
    fixture.write("staged.txt", "staged content\n");
    fixture.add("staged.txt");
    fixture.write("working.txt", "untracked content\n");

    let repo = fixture.open();
    let info = repo_info(&repo).expect("repo_info");
    let branches = list_branch_names(&repo).expect("branches");

    assert!(
        branches.is_empty(),
        "unborn repo must have no branch refs, got {branches:?}"
    );
    assert_eq!(info.head_branch, "HEAD");
    assert_eq!(info.default_base, "main");

    let from_repo_info = overview(&repo, &info.default_base, &info.head_branch);
    assert!(
        from_repo_info.files.iter().any(|f| f.path == "staged.txt"),
        "staged file missing from repo_info overview: {:?}",
        from_repo_info.files
    );
    assert!(
        from_repo_info.files.iter().any(|f| f.path == "working.txt"),
        "untracked file missing from repo_info overview: {:?}",
        from_repo_info.files
    );
    assert!(
        badges_for(&from_repo_info, "staged.txt").contains(&FileBadge::Staged)
            || badges_for(&from_repo_info, "staged.txt").contains(&FileBadge::Untracked),
        "staged.txt badges: {:?}",
        badges_for(&from_repo_info, "staged.txt")
    );
    assert_eq!(
        badges_for(&from_repo_info, "working.txt"),
        vec![FileBadge::Untracked]
    );

    let from_empty_head = overview(&repo, &info.default_base, "");
    assert!(
        from_empty_head.files.iter().any(|f| f.path == "staged.txt"),
        "staged file missing from empty-head overview: {:?}",
        from_empty_head.files
    );
    assert!(
        from_empty_head
            .files
            .iter()
            .any(|f| f.path == "working.txt"),
        "untracked file missing from empty-head overview: {:?}",
        from_empty_head.files
    );
}

#[test]
fn committed_only_file_on_feature_branch() {
    let fixture = TestRepo::init();
    fixture.write("README.md", "# hello\n");
    fixture.add_all();
    fixture.commit("initial on main");
    fixture.checkout_new("feature");
    fixture.write("feature.txt", "new work\n");
    fixture.add("feature.txt");
    fixture.commit("add feature file");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");

    assert_eq!(
        badges_for(&overview, "feature.txt"),
        vec![FileBadge::Committed]
    );
}

#[test]
fn staged_and_unstaged_badges() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "v1\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    fixture.write("file.txt", "v2 staged\n");
    fixture.add("file.txt");
    fixture.write("file.txt", "v3 unstaged\n");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");

    let badges = badges_for(&overview, "file.txt");
    assert!(badges.contains(&FileBadge::Staged));
    assert!(badges.contains(&FileBadge::Unstaged));
}

#[test]
fn untracked_respects_gitignore() {
    let fixture = TestRepo::init();
    fixture.write(".gitignore", "ignored/\n");
    fixture.write("tracked.txt", "ok\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    fixture.write("ignored/secret.txt", "nope\n");
    fixture.write("visible.txt", "yes\n");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");

    assert_eq!(
        badges_for(&overview, "visible.txt"),
        vec![FileBadge::Untracked]
    );
    assert!(overview
        .files
        .iter()
        .all(|f| !f.path.starts_with("ignored/")));
}

#[test]
fn new_file_diff_is_consistent_across_index_state() {
    // A brand-new file must produce the same diff whether it is untracked or
    // staged. libgit2 otherwise emits a `new file mode` / `/dev/null` patch for
    // staged additions (the renderer collapses that to one column, breaking
    // split/unified toggling) vs a change-from-empty form for untracked ones.
    // Normalize both to the change-from-empty form.
    let fixture = TestRepo::init();
    fixture.write("base.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");

    fixture.write("newfile.txt", "alpha\nbeta\ngamma\n");

    let repo = fixture.open();
    let paths = ["newfile.txt".to_string()];

    let untracked = diffs(&repo, "main", "", &paths);
    let untracked_patch = untracked[0].patch.clone();

    fixture.add_all();
    let repo = fixture.open();
    let staged = diffs(&repo, "main", "", &paths);
    let staged_patch = &staged[0].patch;

    assert!(
        !staged_patch.contains("new file mode") && !staged_patch.contains("/dev/null"),
        "staged new-file patch must use the change-from-empty form: {staged_patch}"
    );
    assert_eq!(
        &untracked_patch, staged_patch,
        "untracked and staged new-file patches must be identical"
    );
}

#[test]
fn rename_shows_new_path_and_old_path() {
    let fixture = TestRepo::init();
    fixture.write("old-name.txt", "content\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    fixture.git_mv("old-name.txt", "new-name.txt");
    fixture.commit("rename file");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");

    assert_eq!(
        badges_for(&overview, "new-name.txt"),
        vec![FileBadge::Committed]
    );

    let diff = &diffs(&repo, "main", "", &["new-name.txt".to_string()])[0];
    assert_eq!(diff.path, "new-name.txt");
    assert_eq!(diff.old_path.as_deref(), Some("old-name.txt"));
}

#[test]
fn binary_file_diff_is_marked_binary() {
    let fixture = TestRepo::init();
    fixture.write("README.md", "# hello\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    let png_bytes: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    std::fs::write(fixture.path.join("logo.png"), png_bytes).expect("write png");
    fixture.add("logo.png");
    fixture.commit("add png");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "");
    assert!(
        overview.files.iter().any(|f| f.path == "logo.png"),
        "png should appear in overview"
    );
    let png = &diffs(&repo, "main", "", &["logo.png".to_string()])[0];

    assert!(png.is_binary);
    assert!(png.patch.contains("Binary files"));
}

#[test]
fn missing_base_branch_falls_back_to_default() {
    let fixture = TestRepo::init();
    fixture.write("README.md", "# hello\n");
    fixture.add_all();
    fixture.commit("initial");
    fixture.checkout_new("feature");

    let repo = fixture.open();
    let normalized = normalize_base_branch(&repo, "nonexistent-branch");

    assert_eq!(normalized, "main");
    let overview = overview(&repo, "nonexistent-branch", "");
    assert_eq!(overview.base_branch, "main");
}

#[test]
fn arbitrary_head_diffs_ref_to_ref_ignoring_working_tree() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");

    fixture.checkout_new("feat-a");
    fixture.write("file.txt", "from feat-a\n");
    fixture.add("file.txt");
    fixture.commit("feat-a change");

    fixture.checkout_new("feat-b");
    fixture.write("file.txt", "dirty working copy\n");

    let repo = fixture.open();

    // head = feat-a (not the checked-out branch): ref-to-ref, working tree ignored.
    let overview = overview(&repo, "main", "feat-a");
    assert_eq!(
        badges_for(&overview, "file.txt"),
        vec![FileBadge::Committed]
    );

    let file_diffs = diffs(&repo, "main", "feat-a", &["file.txt".to_string()]);
    let patch = &file_diffs[0].patch;
    assert!(patch.contains("from feat-a"), "patch: {patch}");
    assert!(
        !patch.contains("dirty working copy"),
        "ref-to-ref must not include the working tree: {patch}"
    );
}

#[test]
fn live_head_includes_uncommitted_working_tree() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");
    fixture.write("file.txt", "dirty working copy\n");

    let repo = fixture.open();

    // Empty head = live mode against the checked-out branch.
    let file_diffs = diffs(&repo, "main", "", &["file.txt".to_string()]);
    assert!(file_diffs[0].patch.contains("dirty working copy"));
}

/// Live new-side is the working tree, not HEAD. A file committed on the
/// branch then restored to match the merge-base must not stay in the overview
/// (no workdir delta, and the file-diff path would return an empty patch).
#[test]
fn live_overview_excludes_files_reverted_to_base_in_workdir() {
    let fixture = TestRepo::init();
    fixture.write("keep.txt", "base keep\n");
    fixture.write("reverted.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");

    fixture.checkout_new("feature");
    fixture.write("keep.txt", "feature keep\n");
    fixture.write("reverted.txt", "feature\n");
    fixture.add_all();
    fixture.commit("feature changes");

    // Restore one committed file so the working tree matches main.
    fixture.write("reverted.txt", "base\n");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "feature");
    assert!(overview.is_live, "head == current branch must be live");

    let paths: Vec<&str> = overview.files.iter().map(|f| f.path.as_str()).collect();
    assert!(
        paths.contains(&"keep.txt"),
        "still-dirty committed file must remain: {paths:?}"
    );
    assert!(
        !paths.contains(&"reverted.txt"),
        "file matching merge-base in the workdir must not appear: {paths:?}"
    );
    assert_eq!(
        badges_for(&overview, "keep.txt"),
        vec![FileBadge::Committed]
    );

    let paths: Vec<String> = overview.files.iter().map(|f| f.path.clone()).collect();
    let file_diffs = diffs(&repo, "main", "feature", &paths);
    assert_eq!(file_diffs.len(), overview.files.len());
    for diff in &file_diffs {
        assert!(
            !diff.patch.trim().is_empty(),
            "overview path {} produced an empty patch",
            diff.path
        );
    }
}

/// Untracked files (including nested + empty) must still appear in live
/// overview, and every listed path must produce a renderable patch.
#[test]
fn live_overview_includes_untracked_and_every_file_has_a_patch() {
    let fixture = TestRepo::init();
    fixture.write("tracked.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");

    fixture.write("tracked.txt", "unstaged\n");
    fixture.write("nested/new.txt", "untracked nested\n");
    fixture.write("empty.txt", "");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "feature");
    let paths: Vec<&str> = overview.files.iter().map(|f| f.path.as_str()).collect();
    assert!(paths.contains(&"tracked.txt"), "{paths:?}");
    assert!(paths.contains(&"nested/new.txt"), "{paths:?}");
    assert!(paths.contains(&"empty.txt"), "{paths:?}");
    assert_eq!(
        badges_for(&overview, "nested/new.txt"),
        vec![FileBadge::Untracked]
    );
    assert_eq!(
        badges_for(&overview, "empty.txt"),
        vec![FileBadge::Untracked]
    );

    let owned: Vec<String> = overview.files.iter().map(|f| f.path.clone()).collect();
    let file_diffs = diffs(&repo, "main", "feature", &owned);
    assert_eq!(file_diffs.len(), overview.files.len());
    for diff in &file_diffs {
        assert!(
            !diff.patch.trim().is_empty(),
            "overview path {} produced an empty patch",
            diff.path
        );
    }
}

#[test]
fn live_untracked_binary_in_new_dir_is_marked_binary() {
    let fixture = TestRepo::init();
    fixture.write("tracked.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");

    let png_bytes: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    std::fs::create_dir_all(fixture.path.join("assets")).expect("mkdir");
    std::fs::write(fixture.path.join("assets/logo.png"), png_bytes).expect("write png");

    let repo = fixture.open();
    let overview = overview(&repo, "main", "feature");
    assert!(
        overview.files.iter().any(|f| f.path == "assets/logo.png"),
        "untracked binary missing from overview: {:?}",
        overview.files
    );
    let png = &diffs(&repo, "main", "feature", &["assets/logo.png".to_string()])[0];
    assert!(png.is_binary);
    assert!(png.patch.contains("Binary files"), "patch: {}", png.patch);
}

/// FE always sends a concrete headBranch; head == current must stay live.
#[test]
fn live_head_equals_current_branch_includes_working_tree() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");
    fixture.write("file.txt", "dirty working copy\n");

    let repo = fixture.open();

    let empty_head = diffs(&repo, "main", "", &["file.txt".to_string()]);
    let named_current = diffs(&repo, "main", "feature", &["file.txt".to_string()]);
    assert!(empty_head[0].patch.contains("dirty working copy"));
    assert!(named_current[0].patch.contains("dirty working copy"));
    assert_eq!(empty_head[0].patch, named_current[0].patch);
}

#[test]
fn comparison_metadata_normalizes_base() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");
    fixture.write("feature.txt", "work\n");
    fixture.add("feature.txt");
    fixture.commit("feature commit");

    let repo = fixture.open();
    let metas = branch_metadata(&repo, "nonexistent-branch").expect("metadata");

    let feature = metas.iter().find(|m| m.name == "feature").expect("feature");
    assert_eq!(feature.ahead, 1);
    assert!(feature.is_current);
}

#[test]
fn branch_metadata_reports_divergence_from_base() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");
    fixture.write("feature.txt", "work\n");
    fixture.add("feature.txt");
    fixture.commit("feature commit");

    let repo = fixture.open();
    let metas = branch_metadata(&repo, "main").expect("metadata");

    let feature = metas.iter().find(|m| m.name == "feature").expect("feature");
    assert_eq!(feature.ahead, 1);
    assert_eq!(feature.behind, 0);
    assert!(feature.is_current);
    assert_eq!(feature.last_subject, "feature commit");

    let main = metas.iter().find(|m| m.name == "main").expect("main");
    assert_eq!(main.ahead, 0);
    assert!(main.is_default);
}

#[test]
fn resolution_cache_reuses_until_refs_move() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");

    fixture.checkout_new("feat-a");
    fixture.write("file.txt", "from feat-a\n");
    fixture.add("file.txt");
    fixture.commit("feat-a change");

    // Checked-out branch differs from head: committed (ref-to-ref) mode.
    fixture.checkout_new("feat-b");

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();
    let spec = ComparisonSpec::new("main", "feat-a");
    let paths = ["file.txt".to_string()];

    let ov = ComparisonSpec::overview(&repo, &spec, &mut cache).expect("overview");
    let stamp = resolve_comparison_stamp(&repo, "main", "feat-a", &mut cache).expect("stamp");
    let file_diffs = ComparisonSpec::file_diffs(&repo, &spec, &paths, &mut cache).expect("diffs");

    assert_eq!(ov.merge_base, stamp.merge_base);
    assert_eq!(ov.head_oid, stamp.head_oid);
    assert_eq!(ov.is_live, stamp.is_live);
    assert!(!stamp.is_live);
    assert_eq!(badges_for(&ov, "file.txt"), vec![FileBadge::Committed]);
    assert!(file_diffs[0].patch.contains("from feat-a"));

    assert!(std::process::Command::new("git")
        .args(["checkout", "feat-a"])
        .current_dir(&fixture.path)
        .status()
        .expect("checkout feat-a")
        .success());
    fixture.write("file.txt", "from feat-a v2\n");
    fixture.add("file.txt");
    fixture.commit("feat-a advance");
    assert!(std::process::Command::new("git")
        .args(["checkout", "feat-b"])
        .current_dir(&fixture.path)
        .status()
        .expect("checkout feat-b")
        .success());

    let repo = fixture.open();
    let stamp2 =
        resolve_comparison_stamp(&repo, "main", "feat-a", &mut cache).expect("stamp after move");
    assert_ne!(stamp.head_oid, stamp2.head_oid);
    assert_eq!(stamp.merge_base, stamp2.merge_base);

    let ov2 = ComparisonSpec::overview(&repo, &spec, &mut cache).expect("overview after move");
    let diffs2 =
        ComparisonSpec::file_diffs(&repo, &spec, &paths, &mut cache).expect("diffs after move");
    assert_eq!(ov2.head_oid, stamp2.head_oid);
    assert!(diffs2[0].patch.contains("from feat-a v2"));
}

#[test]
fn live_comparison_stays_fresh_with_cache() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();
    let spec = ComparisonSpec::new("main", "");

    let before = ComparisonSpec::overview(&repo, &spec, &mut cache).expect("overview before");
    assert!(before.files.iter().all(|f| f.path != "visible.txt"));

    fixture.write("file.txt", "dirty working copy\n");
    fixture.write("visible.txt", "untracked\n");

    let after = ComparisonSpec::overview(&repo, &spec, &mut cache).expect("overview after");
    assert!(
        after.files.iter().any(|f| f.path == "visible.txt"),
        "workdir change must remain visible with a warm cache: {:?}",
        after.files
    );
    assert_eq!(
        badges_for(&after, "visible.txt"),
        vec![FileBadge::Untracked]
    );
    let badges = badges_for(&after, "file.txt");
    assert!(
        badges.contains(&FileBadge::Unstaged),
        "file.txt badges: {badges:?}"
    );
}

#[test]
fn comparison_file_contents_live_and_committed() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");
    fixture.write("file.txt", "feature tip\n");
    fixture.add_all();
    fixture.commit("feature commit");
    // Leave feature tip clean, then check out main so main×feature is ref-to-ref
    // (head == current would force live mode).
    {
        let repo = fixture.open();
        let obj = repo.revparse_single("refs/heads/main").expect("main");
        repo.set_head("refs/heads/main").expect("set head");
        repo.checkout_tree(&obj, None).expect("checkout main");
    }
    fixture.write("file.txt", "working tree dirty\n");

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();

    let live = ComparisonSpec::file_contents(
        &repo,
        &ComparisonSpec::new("main", ""),
        "file.txt",
        None,
        &mut cache,
    )
    .expect("live contents");
    assert_eq!(live.old.as_deref(), Some("base\n"));
    assert_eq!(live.new.as_deref(), Some("working tree dirty\n"));

    let committed = ComparisonSpec::file_contents(
        &repo,
        &ComparisonSpec::new("main", "feature"),
        "file.txt",
        None,
        &mut cache,
    )
    .expect("committed contents");
    assert_eq!(committed.old.as_deref(), Some("base\n"));
    assert_eq!(committed.new.as_deref(), Some("feature tip\n"));
}

#[test]
fn write_working_file_shows_up_in_live_contents() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base");
    fixture.checkout_new("feature");

    let repo_path = fixture.path.to_string_lossy().into_owned();
    write_working_file(&repo_path, "file.txt", "edited\n", Some("base\n")).expect("write");

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();
    let live = ComparisonSpec::file_contents(
        &repo,
        &ComparisonSpec::new("main", ""),
        "file.txt",
        None,
        &mut cache,
    )
    .expect("live contents");
    assert_eq!(live.new.as_deref(), Some("edited\n"));
}

#[test]
fn write_working_file_cas_match_mismatch_and_absent() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base");
    fixture.checkout_new("feature");

    let repo_path = fixture.path.to_string_lossy().into_owned();
    let path = fixture.path.join("file.txt");

    write_working_file(&repo_path, "file.txt", "ok\n", Some("base\n")).expect("match write");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "ok\n");

    let err = write_working_file(&repo_path, "file.txt", "bad\n", Some("base\n")).unwrap_err();
    assert!(
        err.contains("conflict: working-tree file changed since hydration"),
        "got {err}"
    );
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "ok\n",
        "mismatch must leave disk untouched"
    );

    write_working_file(&repo_path, "brand-new.txt", "created\n", None).expect("absent write");
    assert_eq!(
        std::fs::read_to_string(fixture.path.join("brand-new.txt")).unwrap(),
        "created\n"
    );
}

#[test]
fn comparison_file_contents_rejects_latin1_committed() {
    let fixture = TestRepo::init();
    // Latin-1 0xE9 (é) is not valid UTF-8.
    std::fs::write(fixture.path.join("latin1.txt"), [0xE9u8]).expect("write bytes");
    fixture.add_all();
    fixture.commit("latin1 blob");
    fixture.checkout_new("feature");

    // Leave tip clean, check out main so main×feature is ref-to-ref.
    {
        let repo = fixture.open();
        let obj = repo.revparse_single("refs/heads/main").expect("main");
        repo.set_head("refs/heads/main").expect("set head");
        repo.checkout_tree(&obj, None).expect("checkout main");
    }

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();
    let err = ComparisonSpec::file_contents(
        &repo,
        &ComparisonSpec::new("main", "feature"),
        "latin1.txt",
        None,
        &mut cache,
    )
    .unwrap_err();
    assert!(
        err.contains("UTF-8"),
        "strict hydration must reject latin-1, got {err}"
    );
}

#[test]
fn committing_on_current_branch_invalidates_live_resolution() {
    let fixture = TestRepo::init();
    fixture.write("file.txt", "base\n");
    fixture.add_all();
    fixture.commit("base on main");
    fixture.checkout_new("feature");

    let repo = fixture.open();
    let mut cache = ResolutionCache::default();

    let stamp1 =
        resolve_comparison_stamp(&repo, "main", "", &mut cache).expect("stamp before commit");
    assert!(stamp1.is_live);

    fixture.write("extra.txt", "committed on feature\n");
    fixture.add("extra.txt");
    fixture.commit("advance feature tip");

    let repo = fixture.open();
    let stamp2 =
        resolve_comparison_stamp(&repo, "main", "", &mut cache).expect("stamp after commit");
    assert!(stamp2.is_live);
    assert_ne!(stamp1.head_oid, stamp2.head_oid);

    let mut fresh = ResolutionCache::default();
    let expected = resolve_comparison_stamp(&repo, "main", "", &mut fresh).expect("fresh stamp");
    assert_eq!(stamp2.merge_base, expected.merge_base);
    assert_eq!(stamp2.head_oid, expected.head_oid);
}
