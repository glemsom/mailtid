#!/usr/bin/env bash
# bin/deploy.sh — rsync addons/mailtid/ to the Home Assistant host and
# (best-effort) trigger a Supervisor rebuild.
#
# Reads the SSH password from $MAILTID_DEPLOY_PASS or, if unset, from
# .pass in the repo root.
#
# Idempotent: safe to run repeatedly. Fails loudly if rsync itself
# cannot connect or transfer.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/addons/mailtid"
DST_HOST="root@192.168.50.171"
DST_PATH="/addons/mailtid"
SSH_PORT="${SSH_PORT:-22}"

if [[ ! -d "${SRC}" ]]; then
  echo "deploy: source not found: ${SRC}" >&2
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
  RSYNC_SSH="sshpass -e ssh -o StrictHostKeyChecking=accept-new -p ${SSH_PORT}"
elif [[ -n "${MAILTID_DEPLOY_PASS:-}" || -f "${REPO_ROOT}/.pass" ]]; then
  echo "deploy: sshpass not installed but a password was provided." >&2
  echo "        Install sshpass, or use ssh-agent / public-key auth." >&2
  exit 1
else
  RSYNC_SSH="ssh -o StrictHostKeyChecking=accept-new -p ${SSH_PORT}"
fi

echo "deploy: rsync ${SRC} -> ${DST_HOST}:${DST_PATH}"
rsync -a --delete \
  -e "${RSYNC_SSH}" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  "${SRC}/" "${DST_HOST}:${DST_PATH}/"

echo "deploy: triggering Supervisor rebuild (best-effort)"
if command -v sshpass >/dev/null 2>&1; then
  sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "${SSH_PORT}" \
    "${DST_HOST}" "ha addons rebuild mailtid" || \
    echo "deploy: WARN — Supervisor rebuild step failed; the Supervisor may auto-rebuild on next start."
else
  ssh -o StrictHostKeyChecking=accept-new -p "${SSH_PORT}" \
    "${DST_HOST}" "ha addons rebuild mailtid" || \
    echo "deploy: WARN — Supervisor rebuild step failed; the Supervisor may auto-rebuild on next start."
fi

echo "deploy: done"
