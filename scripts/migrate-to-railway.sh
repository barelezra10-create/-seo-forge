#!/usr/bin/env bash
# One-time migration: copy sites + content_index data from local Postgres.app
# to the Railway-hosted Postgres. Run from repo root after sourcing .env.
#
# Pre-reqs:
#   - LOCAL_DATABASE_URL set in .env (default: postgres.app on localhost:5432)
#   - DATABASE_URL points at the Railway public proxy URL
#   - Railway DB has migrations applied (pnpm db:migrate)
#
# Usage:  set -a && source .env && set +a && ./scripts/migrate-to-railway.sh

set -euo pipefail

PG_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL must be set (Railway target)" >&2
  exit 1
fi

LOCAL_URL="${LOCAL_DATABASE_URL:-postgres://seo_forge:seo_forge@localhost:5432/seo_forge}"

echo "Dumping sites + content_index from local ($LOCAL_URL)..."
"$PG_BIN/pg_dump" --data-only --table=sites --table=content_index --inserts "$LOCAL_URL" > /tmp/seo_forge_data.sql
echo "  $(wc -l < /tmp/seo_forge_data.sql) lines dumped"

echo "Truncating target tables..."
"$PG_BIN/psql" "$DATABASE_URL" -c "TRUNCATE content_index, sites RESTART IDENTITY CASCADE;" >/dev/null

echo "Loading into Railway..."
"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 < /tmp/seo_forge_data.sql >/dev/null

LOCAL_COUNT=$("$PG_BIN/psql" -tA "$LOCAL_URL" -c "SELECT COUNT(*) FROM content_index")
REMOTE_COUNT=$("$PG_BIN/psql" -tA "$DATABASE_URL" -c "SELECT COUNT(*) FROM content_index")
echo "Counts:  local=$LOCAL_COUNT  remote=$REMOTE_COUNT"

if [ "$LOCAL_COUNT" != "$REMOTE_COUNT" ]; then
  echo "ERROR: counts don't match" >&2
  exit 1
fi

rm -f /tmp/seo_forge_data.sql
echo "Migration complete."
