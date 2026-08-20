use crate::git::OpenRepoResult;
use crate::settings::{AppSettings, LaunchMode};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use typeshare::typeshare;

const SETTINGS_KEY: &str = "app";

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupSnapshot {
    pub settings: AppSettings,
    pub opened: Option<OpenRepoResult>,
    /// Bootstrap/CLI repos plus persisted workspace-tree repos (sidebar restore).
    pub opened_workspaces: Vec<OpenRepoResult>,
    pub open_error: Option<String>,
    /// Canonical paths of CLI-opened repos in argument order. Empty when launch was not from CLI.
    pub cli_opened_paths: Vec<String>,
}

fn unique_nonempty_paths<I, S>(paths: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for path in paths {
        let trimmed = path.as_ref().trim();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            out.push(trimmed.to_string());
        }
    }
    out
}

/// Parse the CLI `repo` arg. `multiple: true` yields a JSON array; a single
/// value may still arrive as a string.
pub fn cli_repo_paths_from_value(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => unique_nonempty_paths(std::iter::once(s.as_str())),
        Value::Array(items) => unique_nonempty_paths(items.iter().filter_map(Value::as_str)),
        _ => Vec::new(),
    }
}

pub fn extract_cli_repo_paths(matches: &tauri_plugin_cli::Matches) -> Vec<String> {
    matches
        .args
        .get("repo")
        .map(|arg| cli_repo_paths_from_value(&arg.value))
        .unwrap_or_default()
}

/// CLI paths win (all of them); otherwise reopen the persisted active
/// workspace (falling back to `recentRepos[0]`) when launchMode is "reopen".
pub fn resolve_bootstrap_paths(cli_paths: &[String], settings: &AppSettings) -> Vec<String> {
    let cli = unique_nonempty_paths(cli_paths.iter().map(String::as_str));
    if !cli.is_empty() {
        return cli;
    }
    resolve_bootstrap_path(None, settings).into_iter().collect()
}

/// Single-path helper used by reopen fallback and tests.
pub fn resolve_bootstrap_path(cli_path: Option<&str>, settings: &AppSettings) -> Option<String> {
    if let Some(path) = cli_path.map(str::trim).filter(|p| !p.is_empty()) {
        return Some(path.to_string());
    }

    if settings.launch_mode != LaunchMode::Reopen {
        return None;
    }

    if let Some(key) = settings
        .workspace_tree
        .active_comparison_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
    {
        for ws in &settings.workspace_tree.workspaces {
            for cmp in &ws.comparisons {
                let rebuilt = format!("{}|{}|{}", ws.repo_path, cmp.base_branch, cmp.head_branch);
                if rebuilt == key {
                    let repo = ws.repo_path.trim();
                    if !repo.is_empty() {
                        return Some(repo.to_string());
                    }
                }
            }
        }
    }

    if let Some(repo) = settings
        .workspace_tree
        .workspaces
        .first()
        .map(|w| w.repo_path.trim())
        .filter(|p| !p.is_empty())
    {
        return Some(repo.to_string());
    }

    settings
        .recent_repos
        .first()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| p.to_string())
}

/// Remaining persisted workspace paths to `open()`, plus CLI canonical paths
/// in argument order. Bootstrap results that share a canonical path are kept
/// once (first wins).
pub struct StartupOpenPlan {
    pub remaining_paths: Vec<String>,
    pub cli_opened_paths: Vec<String>,
}

pub fn plan_startup_opens(
    opened_from_cli: bool,
    bootstrap_opened: &[OpenRepoResult],
    persisted_repo_paths: impl IntoIterator<Item = impl AsRef<str>>,
) -> StartupOpenPlan {
    let mut seen_open = HashSet::new();
    let mut already = Vec::new();
    for result in bootstrap_opened {
        if seen_open.insert(result.repo.path.clone()) {
            already.push(result.repo.path.clone());
        }
    }

    let open_set: HashSet<&str> = already.iter().map(String::as_str).collect();
    let mut seen_remain = HashSet::new();
    let mut remaining_paths = Vec::new();
    for path in persisted_repo_paths {
        let trimmed = path.as_ref().trim();
        if trimmed.is_empty() || open_set.contains(trimmed) {
            continue;
        }
        if seen_remain.insert(trimmed.to_string()) {
            remaining_paths.push(trimmed.to_string());
        }
    }

    StartupOpenPlan {
        remaining_paths,
        cli_opened_paths: if opened_from_cli { already } else { Vec::new() },
    }
}

pub fn join_open_errors(errors: &[(String, String)]) -> Option<String> {
    if errors.is_empty() {
        return None;
    }
    Some(
        errors
            .iter()
            .map(|(path, err)| format!("{path}: {err}"))
            .collect::<Vec<_>>()
            .join("; "),
    )
}

pub fn read_stored_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<AppSettings, String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .unwrap_or_else(|| serde_json::json!({}));
    Ok(serde_json::from_value(value).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::LaunchMode;
    use serde_json::json;

    fn settings_from(value: Value) -> AppSettings {
        serde_json::from_value(value).expect("settings fixture")
    }

    #[test]
    fn cli_path_wins_over_recent() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(
            resolve_bootstrap_path(Some("/cli/repo"), &settings).as_deref(),
            Some("/cli/repo")
        );
        assert_eq!(
            resolve_bootstrap_paths(&["/cli/one".into(), "/cli/two".into()], &settings),
            vec!["/cli/one".to_string(), "/cli/two".to_string()]
        );
    }

    #[test]
    fn cli_paths_dedupe_and_skip_blanks() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(
            resolve_bootstrap_paths(
                &[
                    " /cli/one ".into(),
                    "".into(),
                    "/cli/one".into(),
                    "/cli/two".into()
                ],
                &settings
            ),
            vec!["/cli/one".to_string(), "/cli/two".to_string()]
        );
    }

    #[test]
    fn empty_cli_paths_fall_through_to_reopen() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(
            resolve_bootstrap_paths(&["".into(), "  ".into()], &settings),
            vec!["/repo/a".to_string()]
        );
    }

    #[test]
    fn cli_value_parses_string_or_array() {
        assert_eq!(
            cli_repo_paths_from_value(&json!("/cli/repo")),
            vec!["/cli/repo".to_string()]
        );
        assert_eq!(
            cli_repo_paths_from_value(&json!(["/a", " /b ", "", "/a", "/c"])),
            vec!["/a".to_string(), "/b".to_string(), "/c".to_string()]
        );
        assert_eq!(
            cli_repo_paths_from_value(&Value::Null),
            Vec::<String>::new()
        );
    }

    #[test]
    fn reopen_uses_first_recent() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a", "/repo/b"]
        }));
        assert_eq!(
            resolve_bootstrap_path(None, &settings).as_deref(),
            Some("/repo/a")
        );
    }

    #[test]
    fn reopen_prefers_active_comparison_workspace() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a", "/repo/b"],
            "workspaceTree": {
                "activeComparisonKey": "/repo/b|main|feature",
                "workspaces": [{
                    "repoPath": "/repo/b",
                    "collapsed": false,
                    "comparisons": [{ "baseBranch": "main", "headBranch": "feature" }]
                }],
                "columnCollapsed": false
            }
        }));
        assert_eq!(
            resolve_bootstrap_path(None, &settings).as_deref(),
            Some("/repo/b")
        );
    }

    #[test]
    fn active_key_with_pipe_in_repo_path() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a"],
            "workspaceTree": {
                "activeComparisonKey": "/repo/weird|dir|main|feature",
                "workspaces": [{
                    "repoPath": "/repo/weird|dir",
                    "collapsed": false,
                    "comparisons": [{ "baseBranch": "main", "headBranch": "feature" }]
                }],
                "columnCollapsed": false
            }
        }));
        assert_eq!(
            resolve_bootstrap_path(None, &settings).as_deref(),
            Some("/repo/weird|dir")
        );
    }

    #[test]
    fn empty_launch_mode_skips_recent() {
        let settings = settings_from(json!({
            "launchMode": "empty",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(resolve_bootstrap_path(None, &settings), None);
    }

    #[test]
    fn cli_paths_win_over_empty_launch_mode() {
        let settings = settings_from(json!({
            "launchMode": "empty",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(
            resolve_bootstrap_paths(&["/cli/one".into(), "/cli/two".into()], &settings),
            vec!["/cli/one".to_string(), "/cli/two".to_string()]
        );
    }

    #[test]
    fn missing_recents_yields_none() {
        let settings = settings_from(json!({ "launchMode": "reopen" }));
        assert_eq!(resolve_bootstrap_path(None, &settings), None);
    }

    #[test]
    fn blank_cli_falls_through_to_recent() {
        let settings = settings_from(json!({
            "launchMode": "reopen",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(
            resolve_bootstrap_path(Some("  "), &settings).as_deref(),
            Some("/repo/a")
        );
    }

    #[test]
    fn partial_store_json_merges_defaults() {
        let settings = settings_from(json!({
            "launchMode": "empty",
            "recentRepos": ["/repo/a"]
        }));
        assert_eq!(settings.launch_mode, LaunchMode::Empty);
        assert_eq!(settings.recent_repos, vec!["/repo/a".to_string()]);
        assert_eq!(settings.split_width, 280.0);
        assert_eq!(settings.theme_id, "harmony");
        assert!(settings.active_path_by_repo.is_empty());
        assert!(settings.base_branch_by_repo.is_empty());
    }

    fn opened(path: &str) -> OpenRepoResult {
        OpenRepoResult {
            repo: crate::git::RepoInfo {
                path: path.to_string(),
                name: "n".into(),
                head_branch: "main".into(),
                default_base: "main".into(),
            },
            branches: vec!["main".into()],
        }
    }

    #[test]
    fn plan_skips_persisted_paths_already_opened() {
        let plan = plan_startup_opens(
            true,
            &[opened("/cli/a"), opened("/cli/b")],
            ["/cli/a", " /persisted/c ", "", "/cli/b", "/persisted/c"],
        );
        assert_eq!(plan.remaining_paths, vec!["/persisted/c".to_string()]);
        assert_eq!(
            plan.cli_opened_paths,
            vec!["/cli/a".to_string(), "/cli/b".to_string()]
        );
    }

    #[test]
    fn plan_omits_cli_paths_when_launch_was_not_cli() {
        let plan = plan_startup_opens(false, &[opened("/repo/a")], ["/repo/a", "/repo/b"]);
        assert_eq!(plan.remaining_paths, vec!["/repo/b".to_string()]);
        assert!(plan.cli_opened_paths.is_empty());
    }

    #[test]
    fn plan_dedupes_bootstrap_canonical_paths() {
        let plan = plan_startup_opens(
            true,
            &[opened("/cli/a"), opened("/cli/a")],
            ["/cli/a", "/persisted/b"],
        );
        assert_eq!(plan.cli_opened_paths, vec!["/cli/a".to_string()]);
        assert_eq!(plan.remaining_paths, vec!["/persisted/b".to_string()]);
    }

    #[test]
    fn join_open_errors_formats_every_path() {
        assert_eq!(join_open_errors(&[]), None);
        assert_eq!(
            join_open_errors(&[
                ("/good".into(), "ok".into()),
                ("/typo".into(), "not a git repository".into()),
            ]),
            Some("/good: ok; /typo: not a git repository".into())
        );
    }
}
