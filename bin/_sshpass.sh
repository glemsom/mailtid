#!/usr/bin/env bash
# Minimal sshpass replacement using SSH_ASKPASS.
# Usage: _sshpass.sh <password> <command...>

PASS="$1"
shift

ASKPASS_SCRIPT="$(mktemp)"
cat > "$ASKPASS_SCRIPT" <<EOF
#!/bin/sh
echo '${PASS}'
EOF
chmod +x "$ASKPASS_SCRIPT"

export SSH_ASKPASS="$ASKPASS_SCRIPT"
export DISPLAY=":0"

# Run via setsid so ssh/scp has no controlling terminal and uses SSH_ASKPASS
setsid "$@"
RC=$?

rm -f "$ASKPASS_SCRIPT"
exit $RC
