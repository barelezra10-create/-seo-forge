#!/bin/sh
# Bootstrap script for the Railway worker container.
# Claude Code stores OAuth tokens in macOS Keychain (on Bar's Mac), but on
# Linux it reads them from ~/.claude/.credentials.json. We pass the JSON
# blob via the CLAUDE_CREDS_JSON env var and write it to disk on every
# container boot. To resync (e.g. after token revocation), update the env
# var and restart the service.

set -eu

if [ -n "${CLAUDE_CREDS_JSON:-}" ]; then
  echo "[bootstrap] writing Claude credentials to /root/.claude/.credentials.json"
  mkdir -p /root/.claude
  printf '%s' "$CLAUDE_CREDS_JSON" > /root/.claude/.credentials.json
  chmod 600 /root/.claude/.credentials.json
  echo "[bootstrap] credentials file: $(wc -c < /root/.claude/.credentials.json) bytes"
else
  echo "[bootstrap] CLAUDE_CREDS_JSON not set; pipeline will fail on claude-code calls"
fi

exec "$@"
