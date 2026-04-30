#!/usr/bin/env bash
set -euo pipefail

PG_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
"$PG_BIN/dropdb" -h localhost -p 5432 -U postgres --if-exists seo_forge
exec "$(dirname "$0")/db-setup.sh"
