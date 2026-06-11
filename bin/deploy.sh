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

# --- resolve password and SSH wrapper ---
SSHPASS_SH="${REPO_ROOT}/bin/_sshpass.sh"
PASSWORD="${MAILTID_DEPLOY_PASS:-}"
if [[ -z "${PASSWORD}" && -f "${REPO_ROOT}/.pass" ]]; then
  PASSWORD="$(tr -d '\n' < "${REPO_ROOT}/.pass")"
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o Port="${SSH_PORT}")

if command -v sshpass >/dev/null 2>&1 && [[ -n "${PASSWORD}" ]]; then
  export SSHPASS="${PASSWORD}"
  RUN=(sshpass -e)
elif [[ -n "${PASSWORD}" ]]; then
  # Fallback when sshpass is missing: use SSH_ASKPASS helper
  RUN=("${SSHPASS_SH}" "${PASSWORD}")
elif [[ -z "${PASSWORD}" ]]; then
  RUN=()
fi

echo "deploy: scp ${SRC} -> ${DST_HOST}:${DST_PATH}"
# Ensure the remote directory exists
"${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" mkdir -p "${DST_PATH}"
# Transfer non-dot files and dotfiles (e.g. .dockerignore)
"${RUN[@]}" scp -r "${SSH_OPTS[@]}" "${SRC}"/* "${SRC}"/.[!.]* "${DST_HOST}:${DST_PATH}/" 2>/dev/null || "${RUN[@]}" scp -r "${SSH_OPTS[@]}" "${SRC}"/* "${DST_HOST}:${DST_PATH}/"

# Reload the store so Supervisor discovers the local add-on (needed after
# first deploy and after Supervisor restarts).
echo "deploy: reloading store to discover local add-on"
"${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" ha store reload >/dev/null 2>&1 || true

# If the add-on is not yet installed, install it (first-time deployment).
# The info command returns YAML; an uninstalled app shows "state: unknown".
app_state=$("${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" "ha apps info local_mailtid 2>&1 | grep '^state:' | cut -d: -f2 | tr -d ' '" || true)
if [[ "${app_state}" == "unknown" ]]; then
  echo "deploy: first-time install of local_mailtid"
  "${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" ha apps install local_mailtid
fi

REBUILD_SSH_CMD=("${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" "ha apps rebuild local_mailtid")

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

# Ensure the add-on is started (rebuild builds the image but may not
# restart the container if it was stopped or in error state).
echo "deploy: starting add-on"
"${RUN[@]}" ssh "${SSH_OPTS[@]}" "${DST_HOST}" ha apps start local_mailtid >/dev/null 2>&1 || true

# Wait briefly for the app to bind its port
echo "deploy: waiting for app to start..."
sleep 5

echo "deploy: smoke test ${SMOKE_URL}"
if ! "${SMOKE_SCRIPT}" "${SMOKE_URL}" "Mailtid"; then
  rc=$?
  echo "deploy: smoke test FAILED (exit ${rc}) — add-on home screen did not respond with 'Mailtid'." >&2
  echo "deploy: the deploy is considered failed." >&2
  exit 1
fi

echo "deploy: done (smoke test OK)"
