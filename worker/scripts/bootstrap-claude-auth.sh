#!/bin/sh
# Bootstrap script for the Railway worker container.
# If CLAUDE_AUTH_TGZ_B64 is set, decode it and extract into /root/ so the
# claude-code CLI can find ~/.claude/ tokens. Runs on every container start
# (cheap — just re-extracts the same files) so re-syncing auth is just an
# env var update + restart.

set -eu

if [ -n "${CLAUDE_AUTH_TGZ_B64:-}" ]; then
  echo "[bootstrap] extracting Claude auth from CLAUDE_AUTH_TGZ_B64..."
  mkdir -p /root
  echo "$CLAUDE_AUTH_TGZ_B64" | base64 -d | tar -C /root -xz
  if [ -d /root/.claude ]; then
    echo "[bootstrap] /root/.claude/ ready ($(ls /root/.claude | wc -l) entries)"
  else
    echo "[bootstrap] WARNING: tar extracted but /root/.claude/ not found"
  fi
else
  echo "[bootstrap] CLAUDE_AUTH_TGZ_B64 not set; pipeline will use API fallback"
fi

exec "$@"
