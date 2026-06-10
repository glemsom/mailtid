#!/usr/bin/env sh
# Mailtid entrypoint. The HA Supervisor passes add-on options as
# /data/options.json; node reads them via the bootstrap module.
set -eu
exec node dist/server/index.js
