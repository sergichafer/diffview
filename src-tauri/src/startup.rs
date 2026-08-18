use crate::git::OpenRepoResult;
use crate::settings::{AppSettings, LaunchMode};
use serde::Serialize;
use serde_json::Value;
use typeshare::typeshare;

const SETTINGS_KEY: &str = "app";

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupSnapshot {
    pub settings: AppSettings,
    pub opened: Option<OpenRepoResult>,
    /// Bootstrap repo plus persisted workspace-tree repos (sidebar restore).
    pub opened_workspaces: Vec<OpenRepoResult>,
    pub open_error: Option<String>,
}

/// CLI path wins; otherwise reopen the persisted active workspace (falling
/// back to `recentRepos[0]`) when launchMode is "reopen".
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

pub fn extract_cli_repo_path(matches: &tauri_plugin_cli::Matches) -> Option<String> {
    matches.args.get("repo").and_then(|arg| match &arg.value {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => None,
    })
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
}
