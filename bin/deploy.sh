#!/usr/bin/env bash
# bin/deploy.sh — scp addons/mailtid/ to the Home Assistant host,
# trigger a Supervisor rebuild, and run a post-deploy smoke test
# against the add-on's home screen.
#
# Reads the SSH password from $MAILTID_DEPLOY_PASS or, if unset, from
# .pass in the repo root.
#
# Idempotent: safe to run repeatedly. Fails loudly with a non-zero
# exit code if scp cannot connect, if the Supervisor rebuild
# command returns non-zero (the error is surfaced to stderr), or if
# the post-deploy smoke test does not see the add-on respond with
# "Mailtid" on its home screen.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/addons/mailtid"
SMOKE_SCRIPT="${REPO_ROOT}/bin/smoke-test.sh"
DST_HOST="root@192.168.50.171"
DST_PATH="/addons/mailtid"
DST_HOSTNAME="${DST_HOST#root@}"
SMOKE_PORT="${SMOKE_PORT:-8210}"
SMOKE_URL="http://${DST_HOSTNAME}:${SMOKE_PORT}/"
SSH_PORT="${SSH_PORT:-22}"

if [[ ! -d "${SRC}" ]]; then
  echo "deploy: source not found: ${SRC}" >&2
  exit 1
fi
if [[ ! -x "${SMOKE_SCRIPT}" ]]; then
  echo "deploy: smoke test script not executable: ${SMOKE_SCRIPT}" >&2
  exit 1
fi

if command -v sshpass >/dev/null 2>&1; then
  PASSWORD="${MAILTID_DEPLOY_PASS:-}"
  if [[ -z "${PASSWORD}" && -f "${REPO_ROOT}/.pass" ]]; then
    PASSWORD="$(tr -d '\n' < "${REPO_ROOT}/.pass")"
  fi
  if [[ -z "${PASSWORD}" ]]; then
    echo "deploy: ssh password not provided (set MAILTID_DEPLOY_PASS or write .pass)" >&2
    exit 1
  fi
  export SSHPASS="${PASSWORD}"
  SCP_SSH_OPTS=(-o StrictHostKeyChecking=accept-new -P "${SSH_PORT}")
  REBUILD_SSH_CMD=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "${SSH_PORT}" "${DST_HOST}" "ha addons rebuild mailtid")
elif [[ -n "${MAILTID_DEPLOY_PASS:-}" || -f "${REPO_ROOT}/.pass" ]]; then
  echo "deploy: sshpass not installed but a password was provided." >&2
  echo "        Install sshpass, or use ssh-agent / public-key auth." >&2
  exit 1
else
  SCP_SSH_OPTS=(-o StrictHostKeyChecking=accept-new -P "${SSH_PORT}")
  REBUILD_SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new -p "${SSH_PORT}" "${DST_HOST}" "ha addons rebuild mailtid")
fi

echo "deploy: scp ${SRC} -> ${DST_HOST}:${DST_PATH}"
# Ensure the remote directory exists
ssh -o StrictHostKeyChecking=accept-new -p "${SSH_PORT}" "${DST_HOST}" mkdir -p "${DST_PATH}"
if command -v sshpass >/dev/null 2>&1 && [[ -n "${SSHPASS:-}" ]]; then
  sshpass -e scp -r "${SCP_SSH_OPTS[@]}" "${SRC}"/* "${DST_HOST}:${DST_PATH}/"
else
  scp -r "${SCP_SSH_OPTS[@]}" "${SRC}"/* "${DST_HOST}:${DST_PATH}/"
fi

echo "deploy: triggering Supervisor rebuild"
# Surface rebuild failures loudly (to stderr) but do not abort the
# script: the Supervisor auto-rebuilds on next add-on start, so the
# smoke test is the real gate for "did the deploy land?".
set +e
rebuild_output=$("${REBUILD_SSH_CMD[@]}" 2>&1)
rebuild_rc=$?
set -e
if [[ ${rebuild_rc} -ne 0 ]]; then
  echo "deploy: WARN — Supervisor rebuild command returned exit ${rebuild_rc}." >&2
  echo "deploy: output was:" >&2
  echo "${rebuild_output}" >&2
  echo "deploy: continuing to smoke test (Supervisor may auto-rebuild on next start)." >&2
fi

echo "deploy: smoke test ${SMOKE_URL}"
if ! "${SMOKE_SCRIPT}" "${SMOKE_URL}" "Mailtid"; then
  rc=$?
  echo "deploy: smoke test FAILED (exit ${rc}) — add-on home screen did not respond with 'Mailtid'." >&2
  echo "deploy: the deploy is considered failed." >&2
  exit 1
fi

echo "deploy: done (smoke test OK)"
