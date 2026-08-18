use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use typeshare::typeshare;

#[typeshare]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LaunchMode {
    #[default]
    Reopen,
    Empty,
}

#[typeshare]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    #[default]
    Dark,
}

#[typeshare]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DiffStyle {
    Unified,
    #[default]
    Split,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedComparison {
    pub base_branch: String,
    pub head_branch: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedWorkspace {
    pub repo_path: String,
    pub collapsed: bool,
    pub comparisons: Vec<PersistedComparison>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceTree {
    pub workspaces: Vec<PersistedWorkspace>,
    /// ComparisonKey: `repoPath|baseBranch|headBranch`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_comparison_key: Option<String>,
    pub column_collapsed: bool,
}

/// Plugin-store JSON under key `"app"`. Font/theme ids are opaque; FE owns
/// valid sets (`normalizeUiFont` / `normalizeCodeFont`).
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub recent_repos: Vec<String>,
    pub launch_mode: LaunchMode,
    pub launch_preference_set: bool,
    pub base_branch_by_repo: HashMap<String, String>,
    pub head_branch_by_repo: HashMap<String, String>,
    pub active_path_by_comparison: HashMap<String, String>,
    /// Legacy per-repo active path, kept for soft migration; FE migrates away.
    #[serde(default)]
    pub active_path_by_repo: HashMap<String, String>,
    pub split_width: f64,
    /// Workspaces column width (200-360). Default 240.
    pub workspaces_width: f64,
    pub workspace_tree: WorkspaceTree,
    pub diff_style: DiffStyle,
    pub theme_mode: ThemeMode,
    pub theme_id: String,
    pub ui_font: String,
    pub code_font: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            recent_repos: Vec::new(),
            launch_mode: LaunchMode::Reopen,
            launch_preference_set: false,
            base_branch_by_repo: HashMap::new(),
            head_branch_by_repo: HashMap::new(),
            active_path_by_comparison: HashMap::new(),
            active_path_by_repo: HashMap::new(),
            split_width: 280.0,
            workspaces_width: 240.0,
            workspace_tree: WorkspaceTree::default(),
            diff_style: DiffStyle::Split,
            theme_mode: ThemeMode::Dark,
            theme_id: "harmony".to_string(),
            ui_font: "inter".to_string(),
            code_font: "system".to_string(),
        }
    }
}
