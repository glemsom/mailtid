#!/usr/bin/env bash
# bin/smoke-test.sh — assert that an HTTP endpoint responds with a
# body containing an expected substring. Used as the post-deploy
# smoke test for the Mailtid add-on.
#
# Usage: bin/smoke-test.sh <url> <expected-substring>
# Exit codes:
#   0  — body contained the expected substring
#   1  — body was retrieved but did not contain the substring
#   2  — bad usage (wrong arg count)
#   *  — the exit code of `curl` (network error, HTTP 4xx/5xx, etc.)

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: smoke-test.sh <url> <expected-substring>" >&2
  exit 2
fi

URL="$1"
EXPECTED="$2"

# `-f` makes curl fail (non-zero exit) on HTTP 4xx/5xx; `-sS` is
# silent on progress but still prints errors. The `||` + explicit
# exit lets us re-emit a single readable message regardless of
# whether curl died on a connection error or an HTTP error.
body=$(curl -fsS "$URL") || {
  rc=$?
  echo "smoke-test: curl failed for $URL (exit $rc)" >&2
  exit $rc
}

# `grep -qF` exits 0 on match, 1 on no match. `--` keeps a leading
# `-` in the expected string from being parsed as a flag.
if ! echo "$body" | grep -qF -- "$EXPECTED"; then
  echo "smoke-test: response from $URL did not contain '$EXPECTED'" >&2
  echo "smoke-test: body was: $body" >&2
  exit 1
fi
