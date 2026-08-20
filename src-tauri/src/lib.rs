pub mod git;
pub mod settings;
mod startup;

use git::{
    branch_metadata, close, list_branch_names, open, read_working_file, resolve_comparison_stamp,
    with_repo, with_slot, write_working_file, BranchMetadata, BranchOverview,
    ComparisonFileContents, ComparisonSpec, ComparisonStamp, FileDiffResult, OpenRepoResult,
    RepoRegistry,
};
use settings::AppSettings;
use startup::{
    extract_cli_repo_paths, read_stored_settings, resolve_bootstrap_paths, StartupSnapshot,
};
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

fn prepare_startup(app: &AppHandle) -> Result<StartupSnapshot, String> {
    let cli_paths = match app.cli().matches() {
        Ok(matches) => extract_cli_repo_paths(&matches),
        Err(e) => {
            eprintln!("CLI matches unavailable: {e}");
            Vec::new()
        }
    };
    let opened_from_cli = !cli_paths.is_empty();

    let settings = read_stored_settings(app)?;
    let paths = resolve_bootstrap_paths(&cli_paths, &settings);

    let mut opened = None;
    let mut open_error = None;
    let mut opened_workspaces: Vec<OpenRepoResult> = Vec::new();
    let mut cli_opened: Vec<OpenRepoResult> = Vec::new();
    {
        let state = app.state::<RepoRegistry>();
        for path in &paths {
            match open(&state, path) {
                Ok(result) => {
                    if opened.is_none() {
                        opened = Some(result.clone());
                    }
                    push_unique_open(&mut opened_workspaces, result);
                }
                Err(e) => {
                    eprintln!("Startup open failed for {path}: {e}");
                    if open_error.is_none() {
                        open_error = Some(e);
                    }
                }
            }
        }
        // Partial CLI success still shows the repos that opened.
        if opened.is_some() {
            open_error = None;
        }
        if opened_from_cli {
            cli_opened = opened_workspaces.clone();
        }

        // Open persisted workspaces so the sidebar restores names/branches cold.
        // Cheap: no overview/diff work. Skip repos already opened as CLI/bootstrap.
        for ws in &settings.workspace_tree.workspaces {
            let path = ws.repo_path.trim();
            if path.is_empty() {
                continue;
            }
            if opened_workspaces.iter().any(|o| o.repo.path == path) {
                continue;
            }
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
        open_error,
        cli_opened,
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
    with_repo(&state, &repo_path, |_repo| {
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
    with_repo(&state, &repo_path, |_repo| {
        write_working_file(&repo_path, &path, &contents, expected.as_deref())
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
                    cli_opened: Vec::new(),
                }
            });
            app.manage(snapshot);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_state,
            open_repository,
            close_repository,
            get_branch_overview,
            get_branch_metadata,
            list_branches,
            get_branch_file_diffs,
            read_working_file_contents,
            read_comparison_file_contents,
            write_working_file_contents,
            get_comparison_stamp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
