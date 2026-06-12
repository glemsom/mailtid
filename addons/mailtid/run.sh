#!/usr/bin/env sh
# Mailtid entrypoint. The HA Supervisor passes add-on options as
# /data/options.json; node reads them via the bootstrap module.
set -eu

# Quick diagnostic: warn if the HA add-on options are missing the
# API key, so the operator sees it in the add-on logs immediately.
# The user can still set the key through the in-app settings page
# (/indstillinger) — this is just an early warning.
if [ -f /data/options.json ]; then
  node -e "
    var fs = require('node:fs');
    try {
      var opts = JSON.parse(fs.readFileSync('/data/options.json','utf8'));
      if (!opts.opencode_api_key || opts.opencode_api_key.length === 0) {
        console.warn('mailtid: ADVARSEL — opencode_api_key er tom i HA-indstillingerne.');
        console.warn('mailtid: Indtast nøglen under Indstillinger → Add-ons → Mailtid → Konfiguration');
        console.warn('mailtid: eller brug /indstillinger i web-UI\'en.');
      }
    } catch(e) { /* file missing or invalid — the app will fall back to defaults */ }
  " 2>&1
fi

exec node dist/server/index.js
