pub mod git;
pub mod remote;
pub mod settings;
mod startup;

use git::{
    branch_metadata, close, history_lane, list_branch_names, open, read_working_file,
    require_working_tree, resolve_comparison_stamp, with_repo, with_slot, write_working_file,
    BranchMetadata,
    BranchOverview, ComparisonFileContents, ComparisonSpec, ComparisonStamp, FileDiffResult,
    HistoryLane, OpenRepoResult, RepoRegistry,
};
use remote::RemoteOpenResult;
use settings::AppSettings;
use startup::{
    extract_cli_repo_paths, join_open_errors, partition_cli_args, plan_startup_opens,
    read_stored_settings, resolve_bootstrap_paths, StartupSnapshot,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_cli::CliExt;

fn push_unique_open(opened_workspaces: &mut Vec<OpenRepoResult>, result: OpenRepoResult) {
    if !opened_workspaces
        .iter()
        .any(|o| o.repo.path == result.repo.path)
    {
        opened_workspaces.push(result);
    }
}

/// Bare clones for remote workspaces live here, one directory per repository.
/// Symlinks resolved, matching the paths libgit2 reports for the clones.
fn remotes_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    remote::prepare_root(&dir.join("remotes"))
}

/// Drop clones no persisted workspace or CLI argument still needs, unless
/// another instance is running. The instance lock lives in managed state so
/// later instances skip pruning while this one runs.
fn prune_remote_clones(app: &AppHandle, settings: &AppSettings, cli_remote_urls: &[String]) {
    let Ok(root) = remotes_root(app) else {
        return;
    };
    let mut keep: HashSet<PathBuf> = HashSet::new();
    for ws in &settings.workspace_tree.workspaces {
        keep.insert(PathBuf::from(ws.repo_path.trim()));
        // The clone the URL maps to today, in case the cache root moved.
        let target = ws.remote_url.as_deref().map(remote::parse_remote);
        if let Some(Ok(target)) = target {
            keep.insert(root.join(target.cache_name()));
        }
    }
    for url in cli_remote_urls {
        if let Ok(target) = remote::parse_remote(url) {
            keep.insert(root.join(target.cache_name()));
        }
    }
    match remote::lock_and_prune(&root, &keep) {
        Ok((lock, _)) => {
            app.manage(lock);
        }
        Err(e) => eprintln!("Remote clone pruning skipped: {e}"),
    }
}

fn prepare_startup(app: &AppHandle) -> Result<StartupSnapshot, String> {
    let cli_args = match app.cli().matches() {
        Ok(matches) => extract_cli_repo_paths(&matches),
        Err(e) => {
            eprintln!("CLI matches unavailable: {e}");
            Vec::new()
        }
    };
    let (cli_paths, cli_remote_urls) = partition_cli_args(&cli_args);
    let opened_from_cli = !cli_paths.is_empty();

    let settings = read_stored_settings(app)?;
    prune_remote_clones(app, &settings, &cli_remote_urls);
    let paths = resolve_bootstrap_paths(&cli_paths, &settings);

    let mut opened = None;
    let mut open_errors: Vec<(String, String)> = Vec::new();
    let mut opened_workspaces: Vec<OpenRepoResult> = Vec::new();
    let mut bootstrap_opened: Vec<OpenRepoResult> = Vec::new();
    let cli_opened_paths;
    {
        let state = app.state::<RepoRegistry>();
        for path in &paths {
            match open(&state, path) {
                Ok(result) => {
                    if opened.is_none() {
                        opened = Some(result.clone());
                    }
                    push_unique_open(&mut opened_workspaces, result.clone());
                    bootstrap_opened.push(result);
                }
                Err(e) => {
                    eprintln!("Startup open failed for {path}: {e}");
                    open_errors.push((path.clone(), e));
                }
            }
        }

        let plan = plan_startup_opens(
            opened_from_cli,
            &bootstrap_opened,
            settings
                .workspace_tree
                .workspaces
                .iter()
                .map(|ws| ws.repo_path.as_str()),
        );
        cli_opened_paths = plan.cli_opened_paths;

        // Open persisted workspaces so the sidebar restores names/branches cold.
        // Cheap: no overview/diff work. Skip repos already opened as CLI/bootstrap.
        for path in &plan.remaining_paths {
            match open(&state, path) {
                Ok(result) => push_unique_open(&mut opened_workspaces, result),
                Err(e) => eprintln!("Startup workspace open failed for {path}: {e}"),
            }
        }
    }

    Ok(StartupSnapshot {
        settings,
        opened,
        opened_workspaces,
        open_error: join_open_errors(&open_errors),
        cli_opened_paths,
        cli_remote_urls,
    })
}

#[tauri::command]
fn get_startup_state(snapshot: State<StartupSnapshot>) -> StartupSnapshot {
    snapshot.inner().clone()
}

#[tauri::command(async)]
async fn open_repository(
    path: String,
    state: State<'_, RepoRegistry>,
) -> Result<OpenRepoResult, String> {
    open(&state, &path)
}

/// Clone or fetch a remote URL into the cache, then open the clone. A pull or
/// merge request URL also returns the comparison to show.
#[tauri::command(async)]
async fn open_remote_repository(
    url: String,
    app: AppHandle,
    state: State<'_, RepoRegistry>,
) -> Result<RemoteOpenResult, String> {
    let target = remote::parse_remote(&url)?;
    let root = remotes_root(&app)?;
    let registry = app.clone();
    let in_use = move |dir: &Path| registry.state::<RepoRegistry>().is_open(dir);
    let synced = tauri::async_runtime::spawn_blocking(move || remote::sync(&root, &target, &in_use))
        .await
        .map_err(|e| e.to_string())??;
    let opened = open(&state, &synced.dir.to_string_lossy())?;
    Ok(RemoteOpenResult {
        opened,
        review: synced.review,
    })
}

/// Fetch a remote workspace's clone and reopen it so branch lists refresh.
/// A bare repository outside the cache is the user's own: reopen, no fetch.
#[tauri::command(async)]
async fn fetch_remote_repository(
    repo_path: String,
    app: AppHandle,
    state: State<'_, RepoRegistry>,
) -> Result<OpenRepoResult, String> {
    let root = remotes_root(&app)?;
    if remote::is_managed(&root, &repo_path) {
        let dir = PathBuf::from(&repo_path);
        tauri::async_runtime::spawn_blocking(move || remote::fetch(&dir))
            .await
            .map_err(|e| e.to_string())??;
    }
    open(&state, &repo_path)
}

#[tauri::command(async)]
async fn close_repository(repo_path: String, state: State<'_, RepoRegistry>) -> Result<(), String> {
    close(&state, &repo_path)
}

#[tauri::command(async)]
async fn get_branch_overview(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    state: State<'_, RepoRegistry>,
) -> Result<BranchOverview, String> {
    with_slot(&state, &repo_path, |repo, cache| {
        ComparisonSpec::overview(repo, &ComparisonSpec::new(base_branch, head_branch), cache)
    })
}

#[tauri::command(async)]
async fn get_branch_metadata(
    repo_path: String,
    base_branch: String,
    state: State<'_, RepoRegistry>,
) -> Result<Vec<BranchMetadata>, String> {
    with_repo(&state, &repo_path, |repo| {
        branch_metadata(repo, &base_branch)
    })
}

#[tauri::command(async)]
async fn list_branches(
    repo_path: String,
    state: State<'_, RepoRegistry>,
) -> Result<Vec<String>, String> {
    with_repo(&state, &repo_path, list_branch_names)
}

#[tauri::command(async)]
async fn get_branch_file_diffs(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    paths: Vec<String>,
    state: State<'_, RepoRegistry>,
) -> Result<Vec<FileDiffResult>, String> {
    with_slot(&state, &repo_path, |repo, cache| {
        ComparisonSpec::file_diffs(
            repo,
            &ComparisonSpec::new(base_branch, head_branch),
            &paths,
            cache,
        )
    })
}

#[tauri::command(async)]
async fn read_working_file_contents(
    repo_path: String,
    path: String,
    state: State<'_, RepoRegistry>,
) -> Result<String, String> {
    with_repo(&state, &repo_path, |repo| {
        require_working_tree(repo)?;
        read_working_file(&repo_path, &path)
    })
}

#[tauri::command(async)]
async fn read_comparison_file_contents(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    path: String,
    old_path: Option<String>,
    state: State<'_, RepoRegistry>,
) -> Result<ComparisonFileContents, String> {
    with_slot(&state, &repo_path, |repo, cache| {
        ComparisonSpec::file_contents(
            repo,
            &ComparisonSpec::new(base_branch, head_branch),
            &path,
            old_path.as_deref(),
            cache,
        )
    })
}

#[tauri::command(async)]
async fn write_working_file_contents(
    repo_path: String,
    path: String,
    contents: String,
    expected: Option<String>,
    state: State<'_, RepoRegistry>,
) -> Result<(), String> {
    with_repo(&state, &repo_path, |repo| {
        require_working_tree(repo)?;
        write_working_file(&repo_path, &path, &contents, expected.as_deref())
    })
}

#[tauri::command(async)]
async fn get_history_lane(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    state: State<'_, RepoRegistry>,
) -> Result<HistoryLane, String> {
    with_repo(&state, &repo_path, |repo| {
        history_lane(repo, &base_branch, &head_branch)
    })
}

#[tauri::command(async)]
async fn get_comparison_stamp(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    state: State<'_, RepoRegistry>,
) -> Result<ComparisonStamp, String> {
    with_slot(&state, &repo_path, |repo, cache| {
        resolve_comparison_stamp(repo, &base_branch, &head_branch, cache)
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_cli::init())
        .manage(RepoRegistry::new())
        .setup(|app| {
            let snapshot = prepare_startup(app.handle()).unwrap_or_else(|e| {
                eprintln!("Startup prepare failed: {e}");
                StartupSnapshot {
                    settings: AppSettings::default(),
                    opened: None,
                    opened_workspaces: Vec::new(),
                    open_error: Some(e),
                    cli_opened_paths: Vec::new(),
                    cli_remote_urls: Vec::new(),
                }
            });
            app.manage(snapshot);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_state,
            open_repository,
            open_remote_repository,
            fetch_remote_repository,
            close_repository,
            get_branch_overview,
            get_branch_metadata,
            list_branches,
            get_branch_file_diffs,
            get_history_lane,
            read_working_file_contents,
            read_comparison_file_contents,
            write_working_file_contents,
            get_comparison_stamp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod window_config_tests {
    use serde_json::Value;

    fn read_windows(path: &str) -> Vec<Value> {
        let text = std::fs::read_to_string(path).unwrap_or_else(|e| {
            panic!("read {path}: {e}");
        });
        let v: Value = serde_json::from_str(&text).unwrap_or_else(|e| {
            panic!("parse {path}: {e}");
        });
        v["app"]["windows"]
            .as_array()
            .cloned()
            .unwrap_or_else(|| panic!("{path} app.windows is not an array"))
    }

    #[test]
    fn macos_overlay_replaces_windows_array_with_decorations() {
        let dir = env!("CARGO_MANIFEST_DIR");
        let base_windows = read_windows(&format!("{dir}/tauri.conf.json"));
        let mac_windows = read_windows(&format!("{dir}/tauri.macos.conf.json"));
        assert_eq!(base_windows.len(), 1);
        assert_eq!(mac_windows.len(), base_windows.len());
        assert_eq!(mac_windows[0]["label"], base_windows[0]["label"]);
        let base = &base_windows[0];
        let mac = &mac_windows[0];
        let base_obj = base.as_object().expect("base window object");
        let mac_obj = mac.as_object().expect("macos window object");

        for (key, value) in base_obj {
            if key == "decorations" {
                continue;
            }
            assert_eq!(
                mac_obj.get(key),
                Some(value),
                "tauri.macos.conf.json windows[0] dropped {key}; RFC 7396 replaces the array"
            );
        }

        assert_eq!(base["decorations"], false);
        assert_eq!(mac["decorations"], true);
        assert_eq!(mac["hiddenTitle"], true);
        assert_eq!(mac["titleBarStyle"], "Overlay");
        assert_eq!(mac["trafficLightPosition"]["x"], serde_json::json!(16));
        assert_eq!(mac["trafficLightPosition"]["y"], serde_json::json!(16));
    }
}
