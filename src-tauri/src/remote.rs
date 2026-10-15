//! Remote workspaces.
//!
//! A remote URL becomes a bare clone under the app cache, one per repository.
//! Clone and fetch run through the system `git` so the user's SSH agent and
//! credential helpers apply. Everything after the sync reads the clone with
//! libgit2, the same path a local workspace takes.
//!
//! A pull request URL (GitHub `/pull/N`, Gitea `/pulls/N`, GitLab
//! `/-/merge_requests/N`) also fetches the review head into `refs/pr/N` (or
//! `refs/mr/N`) and picks the base branch from the forge's merge ref.

use git2::{Oid, Repository};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use typeshare::typeshare;

use crate::git::OpenRepoResult;

/// Prefix for clones that have not finished. Pruned at startup.
const PARTIAL_PREFIX: &str = ".partial-";

/// A partial clone younger than this may belong to another running instance.
const PARTIAL_GRACE: Duration = Duration::from_secs(60 * 60);

/// Local ref namespaces that hold fetched review heads.
pub const REVIEW_REF_GLOBS: [&str; 2] = ["refs/pr/*", "refs/mr/*"];

/// Branch mirror; the only fetch refspec a clone keeps in its config.
const HEADS_REFSPEC: &str = "+refs/heads/*:refs/heads/*";

/// Upper bounds for one git invocation. A stalled network or a prompt nobody
/// can answer ends with an error instead of a sync that never returns.
const CLONE_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Forges whose owner and repository names ignore case.
const CASE_INSENSITIVE_HOSTS: [&str; 8] = [
    "github.com",
    "www.github.com",
    "gitlab.com",
    "www.gitlab.com",
    "codeberg.org",
    "www.codeberg.org",
    "bitbucket.org",
    "www.bitbucket.org",
];

/// Third path segment of a GitHub-style web URL (`owner/repo/<keyword>/...`)
/// that names a page inside the repository.
const WEB_PAGE_SEGMENTS: [&str; 10] = [
    "tree", "blob", "commits", "commit", "compare", "pulls", "issues", "releases", "actions",
    "wiki",
];

/// Cache root file each running instance holds a shared lock on.
const INSTANCES_LOCK: &str = ".instances.lock";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Forge {
    GitHub,
    GitLab,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewTarget {
    pub forge: Forge,
    pub number: u64,
}

impl ReviewTarget {
    /// Review fetched into `refs/<label>`, from a label such as `pr/31`.
    fn from_label(label: &str) -> Option<Self> {
        let (prefix, number) = label.split_once('/')?;
        let forge = match prefix {
            "pr" => Forge::GitHub,
            "mr" => Forge::GitLab,
            _ => return None,
        };
        let number = number.parse::<u64>().ok().filter(|n| *n > 0)?;
        Some(Self { forge, number })
    }

    /// Ref on the forge that holds the review head.
    pub fn remote_head_ref(&self) -> String {
        match self.forge {
            Forge::GitHub => format!("refs/pull/{}/head", self.number),
            Forge::GitLab => format!("refs/merge-requests/{}/head", self.number),
        }
    }

    /// Test merge of the review into its base. First parent is the base tip.
    pub fn remote_merge_ref(&self) -> String {
        match self.forge {
            Forge::GitHub => format!("refs/pull/{}/merge", self.number),
            Forge::GitLab => format!("refs/merge-requests/{}/merge", self.number),
        }
    }

    /// Branch label in the palette and sidebar; resolves through `refs/<label>`.
    pub fn head_label(&self) -> String {
        match self.forge {
            Forge::GitHub => format!("pr/{}", self.number),
            Forge::GitLab => format!("mr/{}", self.number),
        }
    }

    fn local_ref(&self) -> String {
        format!("refs/{}", self.head_label())
    }

    /// Scratch ref for the merge ref; outside every namespace the UI lists.
    fn merge_scratch_ref(&self) -> String {
        format!("refs/diffview/merge/{}", self.head_label())
    }

    fn refspec(&self) -> String {
        format!("+{}:{}", self.remote_head_ref(), self.local_ref())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteTarget {
    /// URL handed to `git clone`.
    pub clone_url: String,
    /// Host without user info or port.
    pub host: String,
    /// Explicit port from the URL, if any.
    pub port: Option<String>,
    /// Repository path on the host, without `.git` (e.g. `sergichafer/diffview`).
    pub repo_path: String,
    pub review: Option<ReviewTarget>,
}

impl RemoteTarget {
    /// Directory name for the clone under the cache root. URLs without a port
    /// keep the `host~owner~repo.git` form earlier clones use.
    pub fn cache_name(&self) -> String {
        let mut host = self.host.to_ascii_lowercase();
        // Known forges match owner and repo names case-insensitively and serve
        // the same repositories under `www.`. Other servers may host `Foo` and
        // `foo` side by side.
        let repo_path = if self.folds_case() {
            if let Some(bare) = host.strip_prefix("www.") {
                host = bare.to_string();
            }
            self.repo_path.to_ascii_lowercase()
        } else {
            self.repo_path.clone()
        };
        let host = match &self.port {
            Some(port) => format!("{host}_{port}"),
            None => host,
        };
        let mut parts = vec![sanitize_segment(&host)];
        parts.extend(repo_path.split('/').map(sanitize_segment));
        format!("{}.git", parts.join("~"))
    }

    /// True for forges in `CASE_INSENSITIVE_HOSTS`.
    fn folds_case(&self) -> bool {
        CASE_INSENSITIVE_HOSTS.contains(&self.host.to_ascii_lowercase().as_str())
    }
}

/// Requested comparison for a review URL.
#[typeshare]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComparison {
    pub base_branch: String,
    pub head_branch: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOpenResult {
    pub opened: OpenRepoResult,
    /// Set when the URL named a pull request or merge request.
    pub review: Option<ReviewComparison>,
}

fn sanitize_segment(segment: &str) -> String {
    segment
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// True when the input names a remote repository instead of a local path.
pub fn is_remote_spec(input: &str) -> bool {
    let s = input.trim();
    ["https://", "http://", "ssh://", "git://"]
        .iter()
        .any(|scheme| {
            s.len() > scheme.len()
                && s.get(..scheme.len())
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
        })
        || scp_like(s).is_some()
}

/// `user@host:path` (scp syntax). A Windows drive path such as `C:\repo` has
/// no `@`, so it never matches.
fn scp_like(s: &str) -> Option<(&str, &str)> {
    if s.contains("://") {
        return None;
    }
    let (authority, path) = s.split_once(':')?;
    // A path separator or a leading `.` or `~` marks a local path such as
    // `./a@b:c` or `/home/me/a@b:c`.
    if authority.contains(['/', '\\']) || authority.starts_with(['.', '~']) {
        return None;
    }
    let (_, host) = authority.split_once('@')?;
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some((host, path))
}

fn strip_dot_git(segment: &str) -> &str {
    segment.strip_suffix(".git").unwrap_or(segment)
}

fn parse_number(segment: Option<&&str>) -> Option<u64> {
    segment.and_then(|s| s.parse::<u64>().ok()).filter(|n| *n > 0)
}

/// Repository segments and an optional review, from a web or clone URL path.
fn split_repo_path<'a>(host: &str, segments: &[&'a str]) -> (Vec<&'a str>, Option<ReviewTarget>) {
    // GitLab: everything before `/-/` is the project; `/-/merge_requests/N`.
    if let Some(dash) = segments.iter().position(|s| *s == "-") {
        let review = (segments.get(dash + 1) == Some(&"merge_requests"))
            .then(|| parse_number(segments.get(dash + 2)))
            .flatten()
            .map(|number| ReviewTarget {
                forge: Forge::GitLab,
                number,
            });
        return (segments[..dash].to_vec(), review);
    }
    // GitHub and GitHub Enterprise: `owner/repo/pull/N`. Gitea, Forgejo and
    // Codeberg: `owner/repo/pulls/N`, served at the same `refs/pull/N/head`.
    if segments.len() >= 4 && matches!(segments[2], "pull" | "pulls") {
        if let Some(number) = parse_number(segments.get(3)) {
            return (
                segments[..2].to_vec(),
                Some(ReviewTarget {
                    forge: Forge::GitHub,
                    number,
                }),
            );
        }
    }
    // github.com web URLs carry extra segments (`/tree/branch`, `/commits`).
    let github =
        host.eq_ignore_ascii_case("github.com") || host.eq_ignore_ascii_case("www.github.com");
    if github && segments.len() > 2 {
        return (segments[..2].to_vec(), None);
    }
    // Other GitHub-style hosts: `owner/repo/<page>/...`.
    if segments.len() >= 3 && WEB_PAGE_SEGMENTS.contains(&segments[2]) {
        return (segments[..2].to_vec(), None);
    }
    // Older GitLab: `group/project/merge_requests/N`, without `/-/`.
    if let Some(at) = segments
        .iter()
        .skip(1)
        .position(|s| *s == "merge_requests")
        .map(|i| i + 1)
    {
        if let Some(number) = parse_number(segments.get(at + 1)) {
            return (
                segments[..at].to_vec(),
                Some(ReviewTarget {
                    forge: Forge::GitLab,
                    number,
                }),
            );
        }
    }
    (segments.to_vec(), None)
}

pub fn parse_remote(input: &str) -> Result<RemoteTarget, String> {
    let raw = input.trim();
    let invalid = || format!("Not a repository URL: {}", redact(raw));

    if let Some((host, path)) = scp_like(raw) {
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if segments.is_empty() {
            return Err(invalid());
        }
        let repo_path = segments
            .iter()
            .map(|s| strip_dot_git(s))
            .collect::<Vec<_>>()
            .join("/");
        return Ok(RemoteTarget {
            clone_url: raw.to_string(),
            host: host.to_string(),
            port: None,
            repo_path,
            review: None,
        });
    }

    let (scheme, rest) = raw.split_once("://").ok_or_else(invalid)?;
    let scheme = scheme.to_ascii_lowercase();
    if !matches!(scheme.as_str(), "https" | "http" | "ssh" | "git") {
        return Err(invalid());
    }
    let rest = rest.split(['?', '#']).next().unwrap_or_default();
    let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
    let host_port = authority.rsplit_once('@').map_or(authority, |(_, h)| h);
    let (host, port) = match host_port.split_once(':') {
        Some((host, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => {
            (host, Some(port.to_string()))
        }
        Some((host, _)) => (host, None),
        None => (host_port, None),
    };
    if host.is_empty() {
        return Err(invalid());
    }

    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let (repo_segments, review) = split_repo_path(host, &segments);
    if repo_segments.is_empty() {
        return Err(invalid());
    }
    let repo_path = repo_segments
        .iter()
        .map(|s| strip_dot_git(s))
        .collect::<Vec<_>>()
        .join("/");
    let clone_url = format!("{scheme}://{authority}/{}", repo_segments.join("/"));

    Ok(RemoteTarget {
        clone_url,
        host: host.to_string(),
        port,
        repo_path,
        review,
    })
}

/// Authority without secrets. An ssh or git user (`git@`) stays so the URL
/// still works; a password goes. HTTP drops the user info entirely, since a
/// lone https user is often a token.
fn safe_authority(scheme: &str, authority: &str) -> String {
    let Some((userinfo, host)) = authority.rsplit_once('@') else {
        return authority.to_string();
    };
    let user = userinfo.split_once(':').map_or(userinfo, |(user, _)| user);
    let http = scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https");
    if http || user.is_empty() {
        host.to_string()
    } else {
        format!("{user}@{host}")
    }
}

/// Clone URL without credentials, for display and recents.
pub fn display_url(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return url.to_string();
    };
    let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
    let authority = safe_authority(scheme, authority);
    let path = path.strip_suffix(".git").unwrap_or(path);
    if path.is_empty() {
        format!("{scheme}://{authority}")
    } else {
        format!("{scheme}://{authority}/{path}")
    }
}

/// Text with the credentials of every `scheme://user:secret@host` removed,
/// for error messages that may quote a URL.
fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("://") {
        let scheme_start = rest[..at]
            .rfind(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')))
            .map_or(0, |i| i + 1);
        let after = &rest[at + 3..];
        let end = after
            .find(|c: char| c == '/' || c.is_whitespace() || matches!(c, '\'' | '"' | '>'))
            .unwrap_or(after.len());
        out.push_str(&rest[..at + 3]);
        out.push_str(&safe_authority(&rest[scheme_start..at], &after[..end]));
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

/// `owner/repo` for a remote clone URL, for the workspace name.
pub fn display_name(url: &str) -> Option<String> {
    parse_remote(url).ok().map(|t| t.repo_path)
}

/// True when the user already chose how git runs ssh.
fn ssh_configured() -> bool {
    std::env::var_os("GIT_SSH_COMMAND").is_some()
        || std::env::var_os("GIT_SSH").is_some()
        || git2::Config::open_default()
            .and_then(|config| config.get_string("core.sshCommand"))
            .is_ok()
}

fn git_command(cwd: Option<&Path>) -> Command {
    let mut cmd = Command::new("git");
    if let Some(dir) = cwd {
        cmd.arg("-C").arg(dir);
    }
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // ssh reads passphrases and host key prompts from /dev/tty, which the
    // null stdin does not cover. BatchMode makes it fail instead.
    if !ssh_configured() {
        cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Own process group, so terminal signals such as Ctrl+C in a
        // `tauri dev` shell do not reach git.
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

struct Finished {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    })
}

/// Run a command to completion, killing it after `timeout`. Both pipes drain
/// on their own threads so a chatty child never blocks on a full pipe.
fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Result<Finished, String> {
    let mut child = cmd.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            "Git is not installed or not on PATH. Remote workspaces need it.".to_string()
        }
        _ => format!("Could not run git: {e}"),
    })?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                // A grandchild such as ssh may still hold the pipes open, so
                // the drain threads are left to finish on their own.
                return Err(format!("git timed out after {}s", timeout.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Could not run git: {e}"));
            }
        }
    };
    Ok(Finished {
        success: status.success(),
        stdout: stdout.join().unwrap_or_default(),
        stderr: stderr.join().unwrap_or_default(),
    })
}

fn run_git_with_timeout(
    cwd: Option<&Path>,
    args: &[&str],
    timeout: Duration,
) -> Result<String, String> {
    let mut cmd = git_command(cwd);
    cmd.args(args);
    let output = run_with_timeout(cmd, timeout)?;
    if output.success {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = stderr
        .lines()
        .map(str::trim)
        .rfind(|l| !l.is_empty())
        .unwrap_or("git exited with an error");
    Err(redact(message.strip_prefix("fatal: ").unwrap_or(message)))
}

fn run_git(cwd: Option<&Path>, args: &[&str]) -> Result<String, String> {
    run_git_with_timeout(cwd, args, FETCH_TIMEOUT)
}

fn unique_suffix() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    format!("{}-{nanos}", std::process::id())
}

/// Real path for comparisons. A path that does not exist yet resolves through
/// its parent, so a lock taken before the clone matches one taken after.
fn canonical(path: &Path) -> PathBuf {
    if let Ok(real) = path.canonicalize() {
        return real;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => parent
            .canonicalize()
            .map_or_else(|_| path.to_path_buf(), |p| p.join(name)),
        _ => path.to_path_buf(),
    }
}

/// Create the cache root and return its real path. libgit2 reports clone
/// paths with symlinks resolved, so the root must match that form.
pub fn prepare_root(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root).map_err(|e| format!("Could not create {}: {e}", root.display()))?;
    root.canonicalize()
        .map_err(|e| format!("Could not resolve {}: {e}", root.display()))
}

/// One lock per clone directory. Concurrent fetches into one repository
/// fight over ref locks.
fn clone_lock(dir: &Path) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    let mut locks = LOCKS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    locks.entry(canonical(dir)).or_default().clone()
}

/// Bare clone into a scratch directory, then move it into place so a
/// half-finished clone never sits at the final path.
fn clone_bare(root: &Path, target: &RemoteTarget, dest: &Path) -> Result<(), String> {
    let scratch = root.join(format!(
        "{PARTIAL_PREFIX}{}-{}",
        target.cache_name(),
        unique_suffix()
    ));
    let scratch_str = scratch.to_string_lossy().to_string();
    let cloned = run_git_with_timeout(
        None,
        &["clone", "--bare", "--quiet", "--", &target.clone_url, &scratch_str],
        CLONE_TIMEOUT,
    )
    .and_then(|_| {
        // `clone --bare` writes no fetch refspec; keep branches mirrored.
        run_git(Some(&scratch), &["config", "remote.origin.fetch", HEADS_REFSPEC])
    });
    if let Err(e) = cloned {
        let _ = fs::remove_dir_all(&scratch);
        return Err(e);
    }
    if fs::rename(&scratch, dest).is_err() {
        let _ = fs::remove_dir_all(&scratch);
        if !is_clone(dest) {
            return Err(format!("Could not move clone into {}", dest.display()));
        }
    }
    Ok(())
}

fn is_clone(dir: &Path) -> bool {
    dir.join("HEAD").is_file() && dir.join("objects").is_dir()
}

/// Earlier builds saved one fetch refspec per review. A review ref that later
/// vanished upstream failed every fetch, so those entries go.
fn remove_review_refspecs(repo: &Repository) {
    let has_review_spec = repo
        .find_remote("origin")
        .and_then(|remote| remote.fetch_refspecs())
        .is_ok_and(|specs| {
            specs
                .iter()
                .flatten()
                .any(|s| s.contains(":refs/pr/") || s.contains(":refs/mr/"))
        });
    if has_review_spec {
        if let Ok(mut config) = repo.config() {
            let _ = config.remove_multivar("remote.origin.fetch", ":refs/(pr|mr)/");
        }
    }
}

/// Review heads this clone already holds.
fn local_reviews(repo: &Repository) -> Vec<ReviewTarget> {
    let mut reviews = Vec::new();
    for glob in REVIEW_REF_GLOBS {
        if let Ok(refs) = repo.references_glob(glob) {
            for reference in refs.flatten() {
                if let Some(review) = reference
                    .name()
                    .and_then(|n| n.strip_prefix("refs/"))
                    .and_then(ReviewTarget::from_label)
                {
                    reviews.push(review);
                }
            }
        }
    }
    reviews
}

/// Move every held review head to its forge ref. One batch when all refs
/// exist; otherwise one by one, and a review whose ref vanished upstream
/// keeps the last commit it fetched.
fn refresh_reviews(dir: &Path, repo: &Repository, skip: Option<&ReviewTarget>) {
    let specs: Vec<String> = local_reviews(repo)
        .iter()
        .filter(|review| Some(*review) != skip)
        .map(ReviewTarget::refspec)
        .collect();
    if specs.is_empty() {
        return;
    }
    let mut args = vec!["fetch", "--quiet", "--no-tags", "origin"];
    args.extend(specs.iter().map(String::as_str));
    if run_git(Some(dir), &args).is_ok() || specs.len() == 1 {
        return;
    }
    for spec in &specs {
        let _ = run_git(Some(dir), &["fetch", "--quiet", "--no-tags", "origin", spec]);
    }
}

/// Point HEAD at the remote's default branch, which may have been renamed
/// since the clone. Best effort.
fn follow_remote_head(dir: &Path, repo: &Repository) {
    let Ok(listing) = run_git(Some(dir), &["ls-remote", "--symref", "origin", "HEAD"]) else {
        return;
    };
    let Some(target) = listing.lines().find_map(|line| {
        line.strip_prefix("ref: ")
            .and_then(|rest| rest.strip_suffix("\tHEAD"))
            .filter(|r| r.starts_with("refs/heads/"))
    }) else {
        return;
    };
    let current = repo
        .find_reference("HEAD")
        .ok()
        .and_then(|head| head.symbolic_target().map(str::to_string));
    if current.as_deref() != Some(target) && repo.find_reference(target).is_ok() {
        let _ = repo.set_head(target);
    }
}

/// Branches, held reviews except `skip`, and HEAD. Caller holds the clone lock.
fn fetch_locked(dir: &Path, skip: Option<&ReviewTarget>) -> Result<(), String> {
    let repo = Repository::open_bare(dir).map_err(|e| e.to_string())?;
    remove_review_refspecs(&repo);
    run_git(
        Some(dir),
        &["fetch", "--prune", "--quiet", "origin", HEADS_REFSPEC],
    )?;
    refresh_reviews(dir, &repo, skip);
    follow_remote_head(dir, &repo);
    Ok(())
}

/// Fetch branches and every review head this clone holds.
pub fn fetch(dir: &Path) -> Result<(), String> {
    let lock = clone_lock(dir);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    fetch_locked(dir, None)
}

/// Base tip from the forge's test merge. None when the review has no merge
/// ref (closed, merged, or conflicting). Caller holds the clone lock.
fn merge_ref_base_tip(dir: &Path, review: &ReviewTarget) -> Option<Oid> {
    let scratch = review.merge_scratch_ref();
    let spec = format!("+{}:{scratch}", review.remote_merge_ref());
    let fetched = run_git(Some(dir), &["fetch", "--quiet", "--no-tags", "origin", &spec]);
    let repo = Repository::open_bare(dir).ok()?;
    let mut reference = repo.find_reference(&scratch).ok()?;
    let tip = fetched
        .ok()
        .and_then(|_| reference.peel_to_commit().ok())
        .and_then(|merge| merge.parent_id(0).ok());
    let _ = reference.delete();
    tip
}

/// Branch the review targets: the branch whose tip is the merge ref's first
/// parent, or one that has moved past it. A branch on the review's own line
/// (its tip is the review head or behind it) is the head branch and never the
/// base. The default branch wins ties and is the fallback.
pub fn pick_review_base(
    repo: &Repository,
    base_tip: Option<Oid>,
    review_head: Option<Oid>,
    default_base: &str,
) -> String {
    let Some(base_tip) = base_tip else {
        return default_base.to_string();
    };
    let on_review_line = |tip: Oid| {
        review_head.is_some_and(|head| {
            tip == head || repo.graph_descendant_of(head, tip).unwrap_or(false)
        })
    };
    let mut exact: Vec<String> = Vec::new();
    let mut ahead: Vec<(String, Oid)> = Vec::new();
    if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
        for (branch, _) in branches.flatten() {
            let (Ok(Some(name)), Some(tip)) = (branch.name(), branch.get().target()) else {
                continue;
            };
            if tip == base_tip {
                exact.push(name.to_string());
            } else if repo.graph_descendant_of(tip, base_tip).unwrap_or(false)
                && !on_review_line(tip)
            {
                ahead.push((name.to_string(), tip));
            }
        }
    }

    if exact.iter().any(|n| n == default_base) {
        return default_base.to_string();
    }
    if let Some(first) = exact.into_iter().min() {
        return first;
    }
    if ahead.iter().any(|(n, _)| n == default_base) {
        return default_base.to_string();
    }
    let forked_at_base = |tip: Oid| {
        review_head.is_some_and(|head| repo.merge_base(tip, head).is_ok_and(|b| b == base_tip))
    };
    let (forked, rest): (Vec<_>, Vec<_>) = ahead.into_iter().partition(|(_, tip)| forked_at_base(*tip));
    forked
        .into_iter()
        .map(|(name, _)| name)
        .min()
        .or_else(|| rest.into_iter().map(|(name, _)| name).min())
        .unwrap_or_else(|| default_base.to_string())
}

#[derive(Debug)]
pub struct SyncedRemote {
    pub dir: PathBuf,
    pub review: Option<ReviewComparison>,
}

/// Clone under `root` whose name is `dir`'s name with other letter case or a
/// `www.` host, as earlier builds named them. An open one (`in_use`) wins,
/// then the most recently modified. Returns the clone and whether it is open.
/// None while anything sits at `dir`; on a case-insensitive filesystem that
/// may be the variant itself.
fn find_variant(
    root: &Path,
    dir: &Path,
    in_use: &dyn Fn(&Path) -> bool,
) -> Option<(PathBuf, bool)> {
    if fs::symlink_metadata(dir).is_ok() {
        return None;
    }
    let wanted = dir.file_name()?.to_str()?;
    let mut best: Option<(bool, std::time::SystemTime, String)> = None;
    for entry in fs::read_dir(root).ok()?.flatten() {
        if !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        let bare = match name.get(..4) {
            Some(prefix) if prefix.eq_ignore_ascii_case("www.") => &name[4..],
            _ => name.as_str(),
        };
        let path = root.join(&name);
        if name.starts_with(PARTIAL_PREFIX)
            || name == wanted
            || !bare.eq_ignore_ascii_case(wanted)
            || !is_clone(&path)
        {
            continue;
        }
        let modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        let candidate = (in_use(&path), modified, name);
        if best.as_ref().is_none_or(|b| candidate > *b) {
            best = Some(candidate);
        }
    }
    best.map(|(open, _, name)| (root.join(name), open))
}

/// Clone (first time) or fetch the remote under `root`, plus the review head.
/// `in_use` reports whether a directory is open in the repository registry.
pub fn sync(
    root: &Path,
    target: &RemoteTarget,
    in_use: &dyn Fn(&Path) -> bool,
) -> Result<SyncedRemote, String> {
    fs::create_dir_all(root).map_err(|e| format!("Could not create {}: {e}", root.display()))?;
    let dir = root.join(target.cache_name());
    let lock = clone_lock(&dir);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    // A clone named before the forge names were folded is reused so nothing
    // downloads again. A closed one moves to the folded name. An open one
    // stays where it is, since renaming it would pull the files out from under
    // its libgit2 handle; its workspace keeps the path it already has.
    let variant = if target.folds_case() && !is_clone(&dir) {
        find_variant(root, &dir, in_use)
    } else {
        None
    };
    let variant_lock = variant.as_ref().map(|(old, _)| clone_lock(old));
    let _variant_guard = variant_lock
        .as_ref()
        .map(|l| l.lock().unwrap_or_else(|e| e.into_inner()));
    let dir = match variant {
        Some((old, false)) if !in_use(&old) && fs::rename(&old, &dir).is_ok() => dir,
        Some((old, _)) => old,
        None => dir,
    };

    if is_clone(&dir) {
        // The same cache entry serves `https://` and `git@` forms of a URL;
        // fetch from the one the user just asked for.
        let repo = Repository::open_bare(&dir).map_err(|e| e.to_string())?;
        let stale = !repo
            .find_remote("origin")
            .is_ok_and(|origin| origin.url() == Some(target.clone_url.as_str()));
        if stale {
            repo.remote_set_url("origin", &target.clone_url)
                .map_err(|e| e.to_string())?;
        }
        fetch_locked(&dir, target.review.as_ref())?;
    } else {
        clone_bare(root, target, &dir)?;
    }

    let Some(review) = &target.review else {
        return Ok(SyncedRemote { dir, review: None });
    };
    // Fetched by hand each time; the config only mirrors branches, so a
    // review that does not exist leaves the clone as it was.
    run_git(
        Some(&dir),
        &["fetch", "--quiet", "--no-tags", "origin", &review.refspec()],
    )
    .map_err(|e| format!("Could not fetch {}: {e}", review.head_label()))?;

    let repo = Repository::open_bare(&dir).map_err(|e| e.to_string())?;
    let default_base = crate::git::repo_info(&repo)?.default_base;
    let review_head = repo.refname_to_id(&review.local_ref()).ok();
    let base_tip = merge_ref_base_tip(&dir, review);
    let comparison = ReviewComparison {
        base_branch: pick_review_base(&repo, base_tip, review_head, &default_base),
        head_branch: review.head_label(),
    };
    Ok(SyncedRemote {
        dir,
        review: Some(comparison),
    })
}

/// True when `path` is a clone this module manages under `root`.
pub fn is_managed(root: &Path, path: &str) -> bool {
    let (Ok(root), Ok(path)) = (root.canonicalize(), Path::new(path).canonicalize()) else {
        return false;
    };
    path.parent() == Some(root.as_path()) && is_clone(&path)
}

fn older_than(path: &Path, age: Duration) -> bool {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|elapsed| elapsed > age)
}

/// Shared lock on the cache root, held for the life of the process. Another
/// instance prunes only while no instance holds one.
pub struct InstanceLock {
    _file: File,
}

/// Join the instances that use `root` and prune when no other one is running.
/// Returns the lock to keep for the process lifetime and whether pruning ran.
pub fn lock_and_prune(
    root: &Path,
    keep: &HashSet<PathBuf>,
) -> Result<(InstanceLock, bool), String> {
    let path = root.join(INSTANCES_LOCK);
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .map_err(|e| format!("Could not open {}: {e}", path.display()))?;
    let lock_err = |e: std::io::Error| format!("Could not lock {}: {e}", path.display());
    let pruned = match file.try_lock() {
        Ok(()) => {
            prune(root, keep);
            // The downgrade is not atomic. An instance that takes the
            // exclusive lock in the gap prunes with its own keep set, and the
            // blocking shared lock below waits for it to finish.
            file.unlock().map_err(lock_err)?;
            true
        }
        Err(std::fs::TryLockError::WouldBlock) => {
            eprintln!("Another diffview instance is running; skipping remote clone pruning.");
            false
        }
        Err(std::fs::TryLockError::Error(e)) => return Err(lock_err(e)),
    };
    file.lock_shared().map_err(lock_err)?;
    Ok((InstanceLock { _file: file }, pruned))
}

/// Remove clones under `root` that no workspace references, and clones that
/// never finished (after a grace period).
fn prune(root: &Path, keep: &HashSet<PathBuf>) {
    prune_with_grace(root, keep, PARTIAL_GRACE);
}

fn prune_with_grace(root: &Path, keep: &HashSet<PathBuf>, grace: Duration) {
    let Ok(root) = root.canonicalize() else {
        return;
    };
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };
    let keep: HashSet<PathBuf> = keep.iter().map(|p| canonical(p)).collect();
    for entry in entries.flatten() {
        // `file_type` does not follow symlinks; a link is never a clone here.
        if !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = root.join(&name);
        let stale_partial =
            name.starts_with(PARTIAL_PREFIX) && (grace.is_zero() || older_than(&path, grace));
        let unused_clone = name.ends_with(".git") && !keep.contains(&path);
        if stale_partial || unused_clone {
            if let Err(e) = fs::remove_dir_all(&path) {
                eprintln!("Could not prune {}: {e}", path.display());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn github(number: u64) -> Option<ReviewTarget> {
        Some(ReviewTarget {
            forge: Forge::GitHub,
            number,
        })
    }

    #[test]
    fn detects_remote_specs() {
        for remote in [
            "https://github.com/sergichafer/diffview",
            "HTTPS://github.com/a/b",
            "http://git.local/a.git",
            "ssh://git@github.com/a/b.git",
            "git://example.org/a",
            "git@github.com:sergichafer/diffview.git",
        ] {
            assert!(is_remote_spec(remote), "{remote}");
        }
        for local in [
            ".",
            "/home/me/repo",
            "C:\\work\\repo",
            "C:/work/repo",
            "relative/dir",
            "https://",
            "ñandú/ruta/del/repositorio",
            "./bk@h:x",
            "/home/me/a@b:c",
            "relative/a@b:c",
            "~/a@b:c",
            ".bk@h:x",
            "dir\\a@b:c",
        ] {
            assert!(!is_remote_spec(local), "{local}");
        }
    }

    #[test]
    fn parses_github_repo_and_pull_urls() {
        let repo = parse_remote("https://github.com/sergichafer/diffview").unwrap();
        assert_eq!(repo.clone_url, "https://github.com/sergichafer/diffview");
        assert_eq!(repo.host, "github.com");
        assert_eq!(repo.repo_path, "sergichafer/diffview");
        assert_eq!(repo.review, None);

        let pull = parse_remote("https://github.com/sergichafer/diffview/pull/31/files?w=1").unwrap();
        assert_eq!(pull.clone_url, "https://github.com/sergichafer/diffview");
        assert_eq!(pull.review, github(31));
        assert_eq!(pull.review.as_ref().unwrap().head_label(), "pr/31");
        assert_eq!(
            pull.review.as_ref().unwrap().remote_head_ref(),
            "refs/pull/31/head"
        );

        let tree = parse_remote("https://github.com/sergichafer/diffview/tree/main/src/").unwrap();
        assert_eq!(tree.clone_url, "https://github.com/sergichafer/diffview");
        assert_eq!(tree.review, None);

        let dotted = parse_remote("https://github.com/sergichafer/diffview.git/").unwrap();
        assert_eq!(dotted.clone_url, "https://github.com/sergichafer/diffview.git");
        assert_eq!(dotted.repo_path, "sergichafer/diffview");
    }

    #[test]
    fn parses_gitlab_and_enterprise_urls() {
        let mr = parse_remote("https://gitlab.com/group/sub/project/-/merge_requests/7").unwrap();
        assert_eq!(mr.clone_url, "https://gitlab.com/group/sub/project");
        assert_eq!(mr.repo_path, "group/sub/project");
        assert_eq!(
            mr.review,
            Some(ReviewTarget {
                forge: Forge::GitLab,
                number: 7
            })
        );
        assert_eq!(mr.review.unwrap().head_label(), "mr/7");

        let ghe = parse_remote("https://git.corp.example/team/app/pull/12").unwrap();
        assert_eq!(ghe.clone_url, "https://git.corp.example/team/app");
        assert_eq!(ghe.review, github(12));

        let plain = parse_remote("https://git.corp.example/deep/path/repo.git").unwrap();
        assert_eq!(plain.repo_path, "deep/path/repo");
        assert_eq!(plain.review, None);
    }

    #[test]
    fn parses_ssh_forms_and_keeps_credentials_out_of_names() {
        let scp = parse_remote("git@github.com:sergichafer/diffview.git").unwrap();
        assert_eq!(scp.clone_url, "git@github.com:sergichafer/diffview.git");
        assert_eq!(scp.host, "github.com");
        assert_eq!(scp.repo_path, "sergichafer/diffview");

        let ssh = parse_remote("ssh://git@host.example:2222/a/b.git").unwrap();
        assert_eq!(ssh.clone_url, "ssh://git@host.example:2222/a/b.git");
        assert_eq!(ssh.host, "host.example");
        assert_eq!(ssh.port.as_deref(), Some("2222"));
        assert_eq!(ssh.cache_name(), "host.example_2222~a~b.git");
        assert_eq!(display_url(&ssh.clone_url), "ssh://git@host.example:2222/a/b");

        let token = parse_remote("https://user:secret@github.com/a/b").unwrap();
        assert_eq!(token.cache_name(), "github.com~a~b.git");
        assert_eq!(display_url(&token.clone_url), "https://github.com/a/b");
    }

    #[test]
    fn rejects_urls_without_a_repository() {
        assert!(parse_remote("https://github.com/").is_err());
        assert!(parse_remote("ftp://example.org/a").is_err());
        assert!(parse_remote("/local/path").is_err());
    }

    #[test]
    fn cache_name_sanitizes_segments() {
        let target = RemoteTarget {
            clone_url: String::new(),
            host: "Example.ORG".into(),
            port: None,
            repo_path: "we ird/re:po".into(),
            review: None,
        };
        assert_eq!(target.cache_name(), "example.org~we_ird~re_po.git");
    }

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("diffview-remote-{tag}-{}", unique_suffix()));
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let mut full = vec![
            "-c",
            "user.name=Diffview Test",
            "-c",
            "user.email=test@diffview.local",
            "-c",
            "commit.gpgsign=false",
        ];
        full.extend_from_slice(args);
        run_git(Some(dir), &full).unwrap_or_else(|e| panic!("git {args:?}: {e}"))
    }

    /// A forge-like source: `main`, `release`, and pull request 1 from a
    /// branch that only exists as `refs/pull/1/head`, based on `release`.
    fn forge_source(dir: &Path) {
        git(dir, &["init", "--quiet", "--initial-branch=main"]);
        fs::write(dir.join("README.md"), "# hello\n").unwrap();
        git(dir, &["add", "README.md"]);
        git(dir, &["commit", "--quiet", "-m", "initial"]);
        git(dir, &["branch", "release"]);
        git(dir, &["checkout", "--quiet", "release"]);
        fs::write(dir.join("release.txt"), "release\n").unwrap();
        git(dir, &["add", "release.txt"]);
        git(dir, &["commit", "--quiet", "-m", "release work"]);
        git(dir, &["checkout", "--quiet", "-b", "contrib"]);
        fs::write(dir.join("feature.txt"), "feature\n").unwrap();
        git(dir, &["add", "feature.txt"]);
        git(dir, &["commit", "--quiet", "-m", "feature"]);
        let head = git(dir, &["rev-parse", "HEAD"]);
        git(dir, &["update-ref", "refs/pull/1/head", &head]);
        git(dir, &["checkout", "--quiet", "release"]);
        git(dir, &["merge", "--quiet", "--no-ff", "-m", "test merge", "contrib"]);
        let merge = git(dir, &["rev-parse", "HEAD"]);
        git(dir, &["update-ref", "refs/pull/1/merge", &merge]);
        git(dir, &["reset", "--quiet", "--hard", "HEAD^1"]);
        git(dir, &["checkout", "--quiet", "main"]);
        git(dir, &["branch", "-D", "--quiet", "contrib"]);
    }

    fn local_target(source: &Path, review: Option<ReviewTarget>) -> RemoteTarget {
        RemoteTarget {
            clone_url: source.to_string_lossy().to_string(),
            host: "local".into(),
            port: None,
            repo_path: "team/app".into(),
            review,
        }
    }

    #[test]
    fn sync_clones_bare_and_resolves_pull_request_base() {
        let source = Scratch::new("source");
        let cache = Scratch::new("cache");
        forge_source(&source.0);

        let plain = sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("clone");
        assert_eq!(plain.dir, cache.0.join("local~team~app.git"));
        assert!(plain.review.is_none());

        let synced = sync(&cache.0, &local_target(&source.0, github(1)), &|_| false).expect("pull");
        assert_eq!(synced.dir, plain.dir);
        assert_eq!(
            synced.review,
            Some(ReviewComparison {
                base_branch: "release".into(),
                head_branch: "pr/1".into(),
            })
        );

        let repo = Repository::open_bare(&synced.dir).expect("open clone");
        let info = crate::git::repo_info(&repo).expect("info");
        assert_eq!(Path::new(&info.path), synced.dir.as_path());
        assert_eq!(info.default_base, "main");
        assert!(is_managed(&cache.0, &info.path));

        let branches = crate::git::list_branch_names(&repo).expect("branches");
        assert_eq!(branches, vec!["main", "pr/1", "release"]);

        let mut resolutions = crate::git::ResolutionCache::default();
        let overview = crate::git::ComparisonSpec::overview(
            &repo,
            &crate::git::ComparisonSpec::new("release", "pr/1"),
            &mut resolutions,
        )
        .expect("overview");
        assert!(!overview.is_live);
        let paths: Vec<&str> = overview.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["feature.txt"]);

        // Same-branch comparison on a bare clone stays ref-to-ref.
        let idle = crate::git::ComparisonSpec::overview(
            &repo,
            &crate::git::ComparisonSpec::new("main", "main"),
            &mut resolutions,
        )
        .expect("idle overview");
        assert!(!idle.is_live);
        assert!(idle.files.is_empty());

        // A later fetch follows the review head with no refspec in the config.
        git(&source.0, &["checkout", "--quiet", "--detach", "refs/pull/1/head"]);
        fs::write(source.0.join("feature.txt"), "feature v2\n").unwrap();
        git(&source.0, &["commit", "--quiet", "-am", "feature v2"]);
        let moved = git(&source.0, &["rev-parse", "HEAD"]);
        git(&source.0, &["update-ref", "refs/pull/1/head", &moved]);
        fetch(&synced.dir).expect("fetch");
        let repo = Repository::open_bare(&synced.dir).expect("reopen clone");
        let tip = repo.revparse_single("pr/1").expect("pr ref").id();
        assert_eq!(tip.to_string(), moved);
    }

    #[test]
    fn sync_rejects_a_missing_pull_request_and_keeps_fetching() {
        let source = Scratch::new("source-missing");
        let cache = Scratch::new("cache-missing");
        forge_source(&source.0);

        let err = sync(&cache.0, &local_target(&source.0, github(99)), &|_| false).unwrap_err();
        assert!(err.starts_with("Could not fetch pr/99"), "{err}");
        let dir = cache.0.join("local~team~app.git");
        fetch(&dir).expect("fetch after a failed review");
    }

    #[test]
    fn pick_review_base_falls_back_to_default() {
        let source = Scratch::new("pick");
        forge_source(&source.0);
        let repo = Repository::open(&source.0).expect("open");
        assert_eq!(pick_review_base(&repo, None, None, "main"), "main");
        let main_tip = repo.revparse_single("main").unwrap().id();
        // `main` and nothing else points at the initial commit; `release` has
        // moved past it, so the exact match wins.
        assert_eq!(pick_review_base(&repo, Some(main_tip), None, "trunk"), "main");
    }

    #[test]
    fn prune_keeps_referenced_clones_only() {
        let cache = Scratch::new("prune");
        for name in ["keep.git", "drop.git", ".partial-x.git-1", "other"] {
            fs::create_dir_all(cache.0.join(name)).unwrap();
        }
        let keep: HashSet<PathBuf> = [PathBuf::from(format!("{}/keep.git/", cache.0.display()))]
            .into_iter()
            .collect();
        prune_with_grace(&cache.0, &keep, std::time::Duration::ZERO);
        let mut left: Vec<String> = fs::read_dir(&cache.0)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        left.sort();
        assert_eq!(left, vec!["keep.git", "other"]);

        // A fresh partial clone may belong to another running instance.
        fs::create_dir_all(cache.0.join(".partial-y.git-2")).unwrap();
        prune(&cache.0, &keep);
        assert!(cache.0.join(".partial-y.git-2").is_dir());
    }

    #[test]
    fn display_url_keeps_ssh_users_and_drops_secrets() {
        assert_eq!(
            display_url("https://token@github.com/a/b.git"),
            "https://github.com/a/b"
        );
        assert_eq!(
            display_url("https://user:secret@github.com/a/b"),
            "https://github.com/a/b"
        );
        assert_eq!(
            display_url("ssh://git@github.com/a/b.git"),
            "ssh://git@github.com/a/b"
        );
        assert_eq!(
            display_url("ssh://git:secret@github.com/a/b.git"),
            "ssh://git@github.com/a/b"
        );
        assert_eq!(
            display_url("git@github.com:a/b.git"),
            "git@github.com:a/b.git"
        );
    }

    #[test]
    fn errors_never_echo_credentials() {
        let err = parse_remote("https://user:hunter2@github.com/").unwrap_err();
        assert!(!err.contains("hunter2"), "{err}");
        assert_eq!(
            redact("unable to access 'https://x:tok@host/a.git/': 403"),
            "unable to access 'https://host/a.git/': 403"
        );
        assert_eq!(
            redact("ssh://git:pw@host/a and git://plain/b"),
            "ssh://git@host/a and git://plain/b"
        );
    }

    #[test]
    fn cache_name_includes_port_and_lowercases_host() {
        let plain = parse_remote("https://GitHub.com/a/b").unwrap();
        assert_eq!(plain.cache_name(), "github.com~a~b.git");
        let ported = parse_remote("https://git.corp:8443/a/b").unwrap();
        assert_eq!(ported.host, "git.corp");
        assert_eq!(ported.cache_name(), "git.corp_8443~a~b.git");
    }

    #[cfg(unix)]
    #[test]
    fn run_with_timeout_kills_a_hung_child() {
        let mut cmd = Command::new("sleep");
        cmd.arg("30").stdout(Stdio::piped()).stderr(Stdio::piped());
        let started = Instant::now();
        let err = run_with_timeout(cmd, Duration::from_millis(200))
            .err()
            .expect("timeout");
        assert_eq!(err, "git timed out after 0s");
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    fn rev(repo_dir: &Path, spec: &str) -> String {
        let repo = Repository::open_bare(repo_dir).expect("open clone");
        let id = repo.revparse_single(spec).expect(spec).id();
        id.to_string()
    }

    #[test]
    fn fetch_survives_a_review_ref_that_vanished_upstream() {
        let source = Scratch::new("source-vanish");
        let cache = Scratch::new("cache-vanish");
        forge_source(&source.0);
        let release = git(&source.0, &["rev-parse", "release"]);
        git(&source.0, &["update-ref", "refs/pull/2/head", &release]);

        let synced = sync(&cache.0, &local_target(&source.0, github(1)), &|_| false).expect("pull 1");
        sync(&cache.0, &local_target(&source.0, github(2)), &|_| false).expect("pull 2");
        let pr1 = rev(&synced.dir, "pr/1");

        // pull 1 disappears upstream; pull 2 moves. The batch fails, the
        // one-by-one pass still moves pull 2.
        git(&source.0, &["update-ref", "-d", "refs/pull/1/head"]);
        let main = git(&source.0, &["rev-parse", "main"]);
        git(&source.0, &["update-ref", "refs/pull/2/head", &main]);
        fetch(&synced.dir).expect("fetch with a vanished review");
        assert_eq!(rev(&synced.dir, "pr/1"), pr1);
        assert_eq!(rev(&synced.dir, "pr/2"), main);

        // Reopening a plain URL also goes through the fetch.
        sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("plain sync");
        assert_eq!(rev(&synced.dir, "pr/1"), pr1);
    }

    #[test]
    fn fetch_removes_legacy_review_refspecs() {
        let source = Scratch::new("source-legacy");
        let cache = Scratch::new("cache-legacy");
        forge_source(&source.0);
        let synced = sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("clone");
        for spec in ["+refs/pull/1/head:refs/pr/1", "+refs/pull/99/head:refs/pr/99"] {
            git(&synced.dir, &["config", "--add", "remote.origin.fetch", spec]);
        }

        fetch(&synced.dir).expect("fetch");
        let specs = git(&synced.dir, &["config", "--get-all", "remote.origin.fetch"]);
        assert_eq!(specs, HEADS_REFSPEC);
    }

    #[test]
    fn sync_points_an_existing_clone_at_the_new_url() {
        let source = Scratch::new("source-url");
        let mirror = Scratch::new("mirror-url");
        let cache = Scratch::new("cache-url");
        forge_source(&source.0);
        git(
            &mirror.0,
            &["clone", "--quiet", "--bare", &source.0.to_string_lossy(), "."],
        );

        let first = sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("clone");
        let moved = sync(&cache.0, &local_target(&mirror.0, None), &|_| false).expect("resync");
        assert_eq!(first.dir, moved.dir);
        let repo = Repository::open_bare(&moved.dir).expect("open clone");
        let origin = repo.find_remote("origin").expect("origin");
        assert_eq!(origin.url(), Some(mirror.0.to_string_lossy().as_ref()));
    }

    #[test]
    fn fetch_follows_a_renamed_default_branch() {
        let source = Scratch::new("source-rename");
        let cache = Scratch::new("cache-rename");
        forge_source(&source.0);
        let synced = sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("clone");

        git(&source.0, &["branch", "-m", "main", "trunk"]);
        fetch(&synced.dir).expect("fetch");
        let repo = Repository::open_bare(&synced.dir).expect("open clone");
        let info = crate::git::repo_info(&repo).expect("info");
        assert_eq!(info.default_base, "trunk");
        assert_eq!(
            crate::git::list_branch_names(&repo).expect("branches"),
            vec!["release", "trunk"]
        );
    }

    #[test]
    fn pick_review_base_skips_the_review_head_branch() {
        let source = Scratch::new("pick-head");
        forge_source(&source.0);
        // The merge ref is stale: `release` moved on, and the contributor's
        // branch is also in the repository.
        let head = git(&source.0, &["rev-parse", "refs/pull/1/head"]);
        git(&source.0, &["branch", "contrib", &head]);
        git(&source.0, &["checkout", "--quiet", "release"]);
        fs::write(source.0.join("release.txt"), "release v2\n").unwrap();
        git(&source.0, &["commit", "--quiet", "-am", "release v2"]);

        let repo = Repository::open(&source.0).expect("open");
        let base_tip = repo
            .revparse_single("refs/pull/1/merge^1")
            .unwrap()
            .id();
        let head = Oid::from_str(&head).unwrap();
        assert_eq!(
            pick_review_base(&repo, Some(base_tip), Some(head), "main"),
            "release"
        );
    }

    #[test]
    fn sync_leaves_no_merge_scratch_ref() {
        let source = Scratch::new("source-scratch");
        let cache = Scratch::new("cache-scratch");
        forge_source(&source.0);
        let synced = sync(&cache.0, &local_target(&source.0, github(1)), &|_| false).expect("pull");
        let repo = Repository::open_bare(&synced.dir).expect("open clone");
        assert_eq!(repo.references_glob("refs/diffview/*").unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn prune_and_is_managed_see_through_a_symlinked_root() {
        let scratch = Scratch::new("prune-link");
        let real = scratch.0.join("real");
        let outside = scratch.0.join("outside.git");
        fs::create_dir_all(real.join("keep.git/objects")).unwrap();
        fs::write(real.join("keep.git/HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::create_dir_all(real.join("drop.git")).unwrap();
        fs::create_dir_all(outside.join("objects")).unwrap();
        let linked = scratch.0.join("linked");
        std::os::unix::fs::symlink(&real, &linked).unwrap();
        std::os::unix::fs::symlink(&outside, real.join("evil.git")).unwrap();

        // libgit2 reports the real path, with a trailing slash.
        let keep_path = format!("{}/", real.join("keep.git").canonicalize().unwrap().display());
        let keep: HashSet<PathBuf> = [PathBuf::from(&keep_path)].into_iter().collect();
        prune_with_grace(&linked, &keep, Duration::ZERO);

        assert!(real.join("keep.git").is_dir());
        assert!(!real.join("drop.git").exists());
        assert!(outside.join("objects").is_dir());
        assert!(fs::symlink_metadata(real.join("evil.git")).is_ok());

        assert!(is_managed(&linked, &keep_path));
        assert!(is_managed(&prepare_root(&linked).unwrap(), &keep_path));
        assert!(!is_managed(&linked, &real.join("evil.git").to_string_lossy()));
    }

    fn gitlab(number: u64) -> Option<ReviewTarget> {
        Some(ReviewTarget {
            forge: Forge::GitLab,
            number,
        })
    }

    fn clone_cache() -> (Scratch, HashSet<PathBuf>) {
        let cache = Scratch::new("instances");
        for name in ["keep.git", "drop.git"] {
            fs::create_dir_all(cache.0.join(name)).unwrap();
        }
        let keep = [cache.0.join("keep.git")].into_iter().collect();
        (cache, keep)
    }

    #[test]
    fn lock_and_prune_skips_while_another_instance_runs() {
        let (cache, keep) = clone_cache();
        let other = File::create(cache.0.join(INSTANCES_LOCK)).unwrap();
        other.lock_shared().unwrap();

        let (_lock, pruned) = lock_and_prune(&cache.0, &keep).unwrap();
        assert!(!pruned);
        assert!(cache.0.join("drop.git").is_dir());
        // Both instances now share the lock, so neither can prune.
        assert!(matches!(other.try_lock(), Err(std::fs::TryLockError::WouldBlock)));
    }

    #[test]
    fn lock_and_prune_runs_alone_and_keeps_a_shared_lock() {
        let (cache, keep) = clone_cache();
        let (lock, pruned) = lock_and_prune(&cache.0, &keep).unwrap();
        assert!(pruned);
        assert!(cache.0.join("keep.git").is_dir());
        assert!(!cache.0.join("drop.git").exists());
        assert!(cache.0.join(INSTANCES_LOCK).is_file());

        // A second instance joins without pruning while the first runs.
        fs::create_dir_all(cache.0.join("drop.git")).unwrap();
        let (_second, pruned) = lock_and_prune(&cache.0, &keep).unwrap();
        assert!(!pruned);
        assert!(cache.0.join("drop.git").is_dir());
        drop(lock);
    }

    #[test]
    fn parses_gitea_pull_urls() {
        let pull = parse_remote("https://codeberg.org/owner/repo/pulls/12").unwrap();
        assert_eq!(pull.clone_url, "https://codeberg.org/owner/repo");
        assert_eq!(pull.repo_path, "owner/repo");
        assert_eq!(pull.review, github(12));
        let review = pull.review.unwrap();
        assert_eq!(review.head_label(), "pr/12");
        assert_eq!(review.remote_head_ref(), "refs/pull/12/head");
        assert_eq!(review.remote_merge_ref(), "refs/pull/12/merge");
    }

    #[test]
    fn parses_legacy_gitlab_merge_request_urls() {
        let mr = parse_remote("https://gitlab.example/group/sub/project/merge_requests/7").unwrap();
        assert_eq!(mr.clone_url, "https://gitlab.example/group/sub/project");
        assert_eq!(mr.repo_path, "group/sub/project");
        assert_eq!(mr.review, gitlab(7));

        let short = parse_remote("https://gitlab.example/group/project/merge_requests/3").unwrap();
        assert_eq!(short.repo_path, "group/project");
        assert_eq!(short.review, gitlab(3));

        // Without a number, or as the first segment, it is part of the path.
        let listing = parse_remote("https://git.example/a/b/c/merge_requests").unwrap();
        assert_eq!(listing.repo_path, "a/b/c/merge_requests");
        assert_eq!(listing.review, None);
        let first = parse_remote("https://git.example/merge_requests/5").unwrap();
        assert_eq!(first.repo_path, "merge_requests/5");
        assert_eq!(first.review, None);
    }

    #[test]
    fn strips_web_page_suffixes_on_any_host() {
        for url in [
            "https://codeberg.org/owner/repo/tree/main/src",
            "https://codeberg.org/owner/repo/issues",
            "https://git.corp.example/owner/repo/blob/main/README.md",
            "https://git.corp.example/owner/repo/commits",
            "https://git.corp.example/owner/repo/commits/main",
            "https://git.corp.example/owner/repo/commit/0123abc",
            "https://git.corp.example/owner/repo/compare/main...feat",
            "https://git.corp.example/owner/repo/pulls",
            "https://git.corp.example/owner/repo/issues/4",
            "https://git.corp.example/owner/repo/releases/tag/v1",
            "https://git.corp.example/owner/repo/actions/runs/9",
            "https://git.corp.example/owner/repo/wiki",
            "https://www.github.com/owner/repo/tree/main",
            "https://gitlab.example/owner/repo/-/tree/main",
        ] {
            let target = parse_remote(url).unwrap();
            assert_eq!(target.repo_path, "owner/repo", "{url}");
            assert_eq!(target.review, None, "{url}");
            assert!(target.clone_url.ends_with("/owner/repo"), "{url}");
        }

        let deep = parse_remote("https://git.corp.example/deep/path/repo.git").unwrap();
        assert_eq!(deep.repo_path, "deep/path/repo");
        let nested = parse_remote("https://git.corp.example/a/b/c/tree").unwrap();
        assert_eq!(nested.repo_path, "a/b/c/tree");
    }

    #[test]
    fn cache_name_ignores_case_on_known_forges_only() {
        for url in [
            "https://github.com/Owner/Repo",
            "https://GitHub.com/owner/REPO.git",
            "ssh://git@github.com/OWNER/repo.git",
            "git@GitHub.com:Owner/Repo.git",
        ] {
            let name = parse_remote(url).unwrap().cache_name();
            assert_eq!(name, "github.com~owner~repo.git", "{url}");
        }
        for (url, name) in [
            ("https://www.github.com/A/B", "github.com~a~b.git"),
            ("https://WWW.GitLab.com/A/B", "gitlab.com~a~b.git"),
            ("https://www.bitbucket.org:8443/A/B", "bitbucket.org_8443~a~b.git"),
            ("https://gitlab.com/Group/Sub/Proj", "gitlab.com~group~sub~proj.git"),
            ("https://codeberg.org/Owner/Repo/pulls/2", "codeberg.org~owner~repo.git"),
            ("git@bitbucket.org:Team/Repo.git", "bitbucket.org~team~repo.git"),
        ] {
            assert_eq!(parse_remote(url).unwrap().cache_name(), name, "{url}");
        }

        let generic = parse_remote("https://Git.Corp.example/Team/App").unwrap();
        assert_eq!(generic.cache_name(), "git.corp.example~Team~App.git");
        assert_ne!(
            generic.cache_name(),
            parse_remote("https://git.corp.example/team/app").unwrap().cache_name()
        );

        // The clone URL and display name keep the case the user typed.
        let typed = parse_remote("https://github.com/Owner/Repo").unwrap();
        assert_eq!(typed.clone_url, "https://github.com/Owner/Repo");
        assert_eq!(typed.repo_path, "Owner/Repo");

        // `www.` folds on known forges only, and stays in the clone URL.
        let www = parse_remote("https://www.github.com/Owner/Repo").unwrap();
        assert_eq!(www.clone_url, "https://www.github.com/Owner/Repo");
        assert_eq!(www.host, "www.github.com");
        let other = parse_remote("https://www.example.org/a/b").unwrap();
        assert_eq!(other.cache_name(), "www.example.org~a~b.git");
    }

    /// The local source served under a forge host that folds case.
    fn forge_target(source: &Path, host: &str, repo_path: &str) -> RemoteTarget {
        RemoteTarget {
            host: host.into(),
            repo_path: repo_path.into(),
            ..local_target(source, None)
        }
    }

    /// A clone at `cache/<name>` with a marker file a fresh clone lacks.
    fn legacy_clone(source: &Path, cache: &Path, name: &str) -> PathBuf {
        let synced = sync(cache, &local_target(source, None), &|_| false).expect("clone");
        let legacy = cache.join(name);
        fs::rename(&synced.dir, &legacy).unwrap();
        fs::write(legacy.join("marker"), "").unwrap();
        legacy
    }

    #[test]
    fn sync_adopts_a_clone_named_with_other_case_or_www() {
        for (legacy_name, host) in [
            ("github.com~Team~App.git", "github.com"),
            ("www.github.com~Team~App.git", "github.com"),
            ("github.com~team~app.git", "www.github.com"),
        ] {
            let source = Scratch::new("source-adopt");
            let cache = Scratch::new("cache-adopt");
            forge_source(&source.0);
            let legacy = legacy_clone(&source.0, &cache.0, legacy_name);

            let target = forge_target(&source.0, host, "Team/App");
            let synced = sync(&cache.0, &target, &|_| false).expect("adopt");
            assert_eq!(synced.dir, cache.0.join("github.com~team~app.git"), "{legacy_name}");
            assert!(synced.dir.join("marker").is_file(), "{legacy_name}");
            if legacy != synced.dir {
                assert!(!legacy.exists(), "{legacy_name}");
            }
            assert_eq!(rev(&synced.dir, "main"), git(&source.0, &["rev-parse", "main"]));
        }
    }

    #[test]
    fn sync_fetches_an_open_case_variant_in_place() {
        let source = Scratch::new("source-open");
        let cache = Scratch::new("cache-open");
        forge_source(&source.0);
        let legacy = legacy_clone(&source.0, &cache.0, "github.com~Team~App.git");

        let target = forge_target(&source.0, "github.com", "Team/App");
        let open = legacy.clone();
        let synced = sync(&cache.0, &target, &|dir| dir == open).expect("in place");
        assert_eq!(synced.dir, legacy);
        assert!(legacy.join("marker").is_file());
        assert!(!cache.0.join("github.com~team~app.git").exists());
    }

    #[test]
    fn sync_clones_again_on_case_sensitive_hosts() {
        let source = Scratch::new("source-sensitive");
        let cache = Scratch::new("cache-sensitive");
        forge_source(&source.0);
        let legacy = legacy_clone(&source.0, &cache.0, "local~Team~App.git");

        let synced = sync(&cache.0, &local_target(&source.0, None), &|_| false).expect("clone");
        assert_eq!(synced.dir, cache.0.join("local~team~app.git"));
        assert!(!synced.dir.join("marker").exists());
        assert!(legacy.join("marker").is_file());
    }

    fn fake_clone(dir: &Path, modified: std::time::SystemTime) {
        fs::create_dir_all(dir.join("objects")).unwrap();
        fs::write(dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        File::open(dir).unwrap().set_modified(modified).unwrap();
    }

    #[test]
    fn find_variant_skips_partials_and_picks_one_deterministically() {
        let cache = Scratch::new("variants");
        let dir = cache.0.join("github.com~team~app.git");
        let old = std::time::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let new = old + Duration::from_secs(60);

        fake_clone(&cache.0.join(".partial-github.com~team~app.git-1"), new);
        fs::create_dir_all(cache.0.join("github.com~TEAM~APP.git")).unwrap();
        assert_eq!(find_variant(&cache.0, &dir, &|_| false), None);

        let older = cache.0.join("github.com~Team~App.git");
        let newer = cache.0.join("www.github.com~team~App.git");
        fake_clone(&older, old);
        fake_clone(&newer, new);
        assert_eq!(find_variant(&cache.0, &dir, &|_| false), Some((newer, false)));
        // An open variant wins over a newer one.
        let open = older.clone();
        assert_eq!(
            find_variant(&cache.0, &dir, &|d| d == open),
            Some((older.clone(), true))
        );

        // Anything at the folded name blocks adoption, which also covers a
        // case-insensitive filesystem resolving it to a variant.
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(find_variant(&cache.0, &dir, &|_| false), None);
    }
}
