/**
 * Remote workspace input. Mirrors `is_remote_spec` in `src-tauri/src/remote.rs`
 * so the UI can route an entry before calling the backend, which owns parsing.
 */

const SCHEMES = ["https://", "http://", "ssh://", "git://"] as const;

/**
 * `user@host:path` (scp syntax). A Windows drive path has no `@`. A path
 * separator or a leading `.` or `~` before the colon marks a local path such
 * as `./a@b:c` or `/home/me/a@b:c`.
 */
function isScpLike(input: string): boolean {
  if (input.includes("://")) return false;
  const colon = input.indexOf(":");
  if (colon < 0) return false;
  const authority = input.slice(0, colon);
  const path = input.slice(colon + 1);
  if (/[/\\]/.test(authority) || /^[.~]/.test(authority)) return false;
  const at = authority.indexOf("@");
  if (at < 0) return false;
  const host = authority.slice(at + 1);
  return host.length > 0 && path.length > 0;
}

/** True when the input names a remote repository instead of a local path. */
export function isRemoteUrl(input: string): boolean {
  const s = input.trim();
  const lower = s.toLowerCase();
  return (
    SCHEMES.some((scheme) => lower.length > scheme.length && lower.startsWith(scheme)) ||
    isScpLike(s)
  );
}

/**
 * The input with credentials removed, for display and logs. http(s) drops
 * userinfo entirely; other schemes keep a bare user (`ssh://git@host/a`) and
 * drop any password. Matches the backend's `remoteUrl`.
 */
export function redactUrl(input: string): string {
  const s = input.trim();
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/is.exec(s);
  if (!match) return s;
  const [, scheme = "", authority = "", rest = ""] = match;
  const at = authority.lastIndexOf("@");
  if (at < 0) return s;
  const host = authority.slice(at + 1);
  if (/^https?:/i.test(scheme)) return `${scheme}${host}${rest}`;
  const user = authority.slice(0, at).split(":")[0];
  return `${scheme}${user ? `${user}@` : ""}${host}${rest}`;
}

/**
 * Third path segment of a GitHub-style web URL (`owner/repo/<keyword>/...`)
 * that names a page inside the repository. Mirrors `WEB_PAGE_SEGMENTS` in
 * `src-tauri/src/remote.rs`.
 */
const WEB_PAGE_SEGMENTS = new Set([
  "tree",
  "blob",
  "commits",
  "commit",
  "compare",
  "pulls",
  "issues",
  "releases",
  "actions",
  "wiki",
]);

/**
 * Review URL for a `pr/N` or `mr/N` head label on a repository URL, so a
 * fresh clone can fetch that review again. Null for other labels and for
 * scp-form URLs, which cannot carry a review path.
 */
export function reviewUrlFor(repoUrl: string, headLabel: string): string | null {
  const match = /^(pr|mr)\/(\d+)$/.exec(headLabel);
  const base = repoUrl.trim().replace(/\/+$/, "");
  if (!match || !/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) return null;
  const [, kind, number] = match;
  return kind === "pr"
    ? `${base}/pull/${number}`
    : `${base}/-/merge_requests/${number}`;
}

/** Short label for a remote URL: `owner/repo`, plus `#N` for a review URL. */
export function remoteLabel(input: string): string {
  const s = input.trim();
  let host = "";
  let path: string;
  if (isScpLike(s)) {
    path = s.slice(s.indexOf(":") + 1);
  } else {
    try {
      const url = new URL(s);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return s;
    }
  }
  const segments = path.split("/").filter(Boolean);
  // scp syntax has no web pages, so the whole path names the repository.
  const { repo, review } = host
    ? splitRepoPath(host, segments)
    : { repo: segments, review: null };
  const name = repo.map((seg) => seg.replace(/\.git$/, "")).join("/") || s;
  return review == null ? name : `${name} #${review}`;
}

function reviewNumber(segment: string | undefined): number | null {
  if (segment == null || !/^\d+$/.test(segment)) return null;
  const n = Number(segment);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Mirrors `split_repo_path` in `src-tauri/src/remote.rs`. */
function splitRepoPath(
  host: string,
  segments: string[],
): { repo: string[]; review: number | null } {
  const dash = segments.indexOf("-");
  if (dash >= 0) {
    const review =
      segments[dash + 1] === "merge_requests"
        ? reviewNumber(segments[dash + 2])
        : null;
    return { repo: segments.slice(0, dash), review };
  }
  if (segments.length >= 4 && (segments[2] === "pull" || segments[2] === "pulls")) {
    const review = reviewNumber(segments[3]);
    if (review != null) return { repo: segments.slice(0, 2), review };
  }
  const lowerHost = host.toLowerCase();
  const github = lowerHost === "github.com" || lowerHost === "www.github.com";
  if (github && segments.length > 2) {
    return { repo: segments.slice(0, 2), review: null };
  }
  if (segments.length >= 3 && WEB_PAGE_SEGMENTS.has(segments[2]!)) {
    return { repo: segments.slice(0, 2), review: null };
  }
  const merge = segments.indexOf("merge_requests", 1);
  if (merge > 0) {
    const review = reviewNumber(segments[merge + 1]);
    if (review != null) return { repo: segments.slice(0, merge), review };
  }
  return { repo: segments, review: null };
}
