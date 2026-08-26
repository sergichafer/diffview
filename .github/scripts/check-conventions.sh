#!/usr/bin/env bash
# Validate conventional branch names, PR titles, and commit subjects.
set -euo pipefail

TYPES='build|chore|ci|deps|docs|feat|fix|perf|refactor|revert|style|test'
COMMIT_RE="^(${TYPES})(\\([A-Za-z0-9._-]+\\))?(!)?: [^[:space:]].*"
BRANCH_RE="^(${TYPES})/.+"

usage() {
  echo "Usage: TYPES match Conventional Commits (feat, fix, deps, docs, ...)."
  echo "  Branch:  feat/add-palette"
  echo "  Title:   feat: add palette picker"
  echo "  Commit:  same as title (subject line)"
}

fail_msg() {
  echo "::error::$1"
  echo "$1" >&2
  FAILED=1
}

self_test() {
  local failed=0

  expect_match() {
    local kind=$1 value=$2 regex=$3
    if [[ ! "$value" =~ $regex ]]; then
      echo "expected $kind to match: $value" >&2
      failed=1
    fi
  }

  expect_reject() {
    local kind=$1 value=$2 regex=$3
    if [[ "$value" =~ $regex ]]; then
      echo "expected $kind to reject: $value" >&2
      failed=1
    fi
  }

  expect_match branch "feat/add-palette" "$BRANCH_RE"
  expect_match branch "fix/windows-webview" "$BRANCH_RE"
  expect_match branch "chore/deps" "$BRANCH_RE"
  expect_match branch "deps/bump-tauri" "$BRANCH_RE"
  expect_reject branch "main" "$BRANCH_RE"
  expect_reject branch "feature/foo" "$BRANCH_RE"
  expect_reject branch "feat" "$BRANCH_RE"
  expect_reject branch "Feat/foo" "$BRANCH_RE"

  expect_match commit "feat: add palette picker" "$COMMIT_RE"
  expect_match commit "fix(windows)!: drop win7" "$COMMIT_RE"
  expect_match commit "chore(deps): bump tauri" "$COMMIT_RE"
  expect_match commit "deps: bump tauri" "$COMMIT_RE"
  expect_reject commit "Add palette picker" "$COMMIT_RE"
  expect_reject commit "feat:" "$COMMIT_RE"
  expect_reject commit "feat: " "$COMMIT_RE"
  expect_reject commit "feat add palette" "$COMMIT_RE"

  if ((failed)); then
    echo "self-test failed" >&2
    exit 1
  fi
  echo "self-test passed"
}

check_pr() {
  : "${HEAD_REF:?HEAD_REF is required}"
  : "${PR_TITLE:?PR_TITLE is required}"
  : "${REPO:?REPO is required}"
  : "${PR_NUMBER:?PR_NUMBER is required}"
  : "${GH_TOKEN:?GH_TOKEN is required}"

  FAILED=0

  if [[ ! "$HEAD_REF" =~ $BRANCH_RE ]]; then
    fail_msg "Branch '${HEAD_REF}' must use a conventional prefix (feat/, fix/, deps/, docs/, style/, refactor/, perf/, test/, build/, ci/, chore/, revert/)."
  fi

  local title=${PR_TITLE//$'\r'/}
  if [[ ! "$title" =~ $COMMIT_RE ]]; then
    fail_msg "PR title must be a conventional commit subject (e.g. 'feat: add palette picker'). Got: ${title}"
  fi

  local subject
  while IFS= read -r subject; do
    [[ -z "$subject" ]] && continue
    subject=${subject//$'\r'/}
    if [[ ! "$subject" =~ $COMMIT_RE ]]; then
      fail_msg "Commit subject must be a conventional commit (e.g. 'feat: add palette picker'). Got: ${subject}"
    fi
  done < <(gh api --paginate "repos/${REPO}/pulls/${PR_NUMBER}/commits" --jq '.[].commit.message | split("\n")[0]')

  if ((FAILED)); then
    usage
    exit 1
  fi
}

case "${1:-}" in
  --self-test) self_test ;;
  --help|-h)
    usage
    ;;
  *)
    check_pr
    ;;
esac
