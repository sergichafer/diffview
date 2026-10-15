import { describe, expect, test } from "bun:test";
import { isRemoteUrl, redactUrl, remoteLabel, reviewUrlFor } from "./remoteUrl";

describe("isRemoteUrl", () => {
  test("accepts remote URL forms", () => {
    for (const url of [
      "https://github.com/sergichafer/diffview",
      "HTTPS://github.com/a/b",
      "http://git.local/a.git",
      "ssh://git@github.com/a/b.git",
      "git://example.org/a",
      "git@github.com:sergichafer/diffview.git",
      "  https://github.com/a/b/pull/3  ",
    ]) {
      expect(isRemoteUrl(url)).toBe(true);
    }
  });

  test("rejects local paths", () => {
    for (const path of [
      ".",
      "/home/me/repo",
      "C:\\work\\repo",
      "C:/work/repo",
      "relative/dir",
      "https://",
      "",
      "./bk@h:x",
      "/home/me/a@b:c",
      "relative/a@b:c",
      "~/a@b:c",
      ".bk@h:x",
      "dir\\a@b:c",
    ]) {
      expect(isRemoteUrl(path)).toBe(false);
    }
  });
});

describe("remoteLabel", () => {
  test("names the repository and the review", () => {
    expect(remoteLabel("https://github.com/sergichafer/diffview")).toBe(
      "sergichafer/diffview",
    );
    expect(remoteLabel("https://github.com/sergichafer/diffview/pull/31")).toBe(
      "sergichafer/diffview #31",
    );
    expect(
      remoteLabel("https://gitlab.com/group/sub/project/-/merge_requests/7"),
    ).toBe("group/sub/project #7");
    expect(remoteLabel("git@github.com:a/b.git")).toBe("a/b");
  });

  test("reads Gitea and legacy GitLab review URLs", () => {
    expect(remoteLabel("https://codeberg.org/forgejo/forgejo/pulls/42")).toBe(
      "forgejo/forgejo #42",
    );
    expect(
      remoteLabel("https://gitlab.example.com/group/sub/project/merge_requests/9"),
    ).toBe("group/sub/project #9");
  });

  test("strips web page suffixes to owner/repo", () => {
    for (const url of [
      "https://gitea.example.com/a/b/tree/main/src",
      "https://gitea.example.com/a/b/commits/main",
      "https://gitea.example.com/a/b/pulls",
      "https://gitea.example.com/a/b/issues/3",
      "https://gitea.example.com/a/b/wiki",
      "https://www.github.com/a/b/anything/else",
      "https://github.com/a/b/tree/main",
      "https://github.com/a/b/pull/not-a-number",
    ]) {
      expect(remoteLabel(url)).toBe("a/b");
    }
  });

  test("keeps deeper paths on hosts it does not know", () => {
    expect(remoteLabel("https://git.example.com/a/b/c.git")).toBe("a/b/c");
    expect(remoteLabel("https://codeberg.org/a/b/src/branch/main")).toBe(
      "a/b/src/branch/main",
    );
    expect(remoteLabel("https://git.example.com/a/b/merge_requests")).toBe(
      "a/b/merge_requests",
    );
  });

  test("falls back to the input when it is not a URL", () => {
    expect(remoteLabel("not a url")).toBe("not a url");
  });
});

describe("redactUrl", () => {
  test("drops userinfo from http(s)", () => {
    expect(redactUrl("https://me:ghp_token@github.com/a/b")).toBe(
      "https://github.com/a/b",
    );
    expect(redactUrl("http://token@git.local/a.git")).toBe("http://git.local/a.git");
    expect(redactUrl("HTTPS://u:p@github.com/a/b/pull/3")).toBe(
      "HTTPS://github.com/a/b/pull/3",
    );
  });

  test("keeps a bare user and drops the password for other schemes", () => {
    expect(redactUrl("ssh://git@github.com/a/b.git")).toBe(
      "ssh://git@github.com/a/b.git",
    );
    expect(redactUrl("ssh://git:secret@github.com/a/b.git")).toBe(
      "ssh://git@github.com/a/b.git",
    );
    expect(redactUrl("git://:secret@example.org/a")).toBe("git://example.org/a");
  });

  test("leaves inputs without credentials as they are", () => {
    for (const url of [
      "https://github.com/a/b",
      "git@github.com:a/b.git",
      "https://github.com/a/b?ref=x@y",
      "/home/me/repo",
    ]) {
      expect(redactUrl(url)).toBe(url);
    }
  });
});

describe("reviewUrlFor", () => {
  test("builds review URLs from head labels", () => {
    expect(reviewUrlFor("https://github.com/a/b", "pr/31")).toBe(
      "https://github.com/a/b/pull/31",
    );
    expect(reviewUrlFor("https://gitlab.com/g/sub/p/", "mr/7")).toBe(
      "https://gitlab.com/g/sub/p/-/merge_requests/7",
    );
    expect(reviewUrlFor("ssh://git@host/a/b", "pr/2")).toBe(
      "ssh://git@host/a/b/pull/2",
    );
  });

  test("skips branch labels and scp-form URLs", () => {
    expect(reviewUrlFor("https://github.com/a/b", "main")).toBeNull();
    expect(reviewUrlFor("https://github.com/a/b", "pr/x")).toBeNull();
    expect(reviewUrlFor("git@github.com:a/b.git", "pr/3")).toBeNull();
  });
});
