#!/usr/bin/env bash
set -euo pipefail

PG_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
PG_HOST="localhost"
PG_PORT="5432"
PG_SUPERUSER="postgres"
DB_NAME="seo_forge"
DB_USER="seo_forge"
DB_PASS="seo_forge"

if ! "$PG_BIN/pg_isready" -h "$PG_HOST" -p "$PG_PORT" -q; then
  echo "ERROR: Postgres is not accepting connections at $PG_HOST:$PG_PORT" >&2
  echo "Open Postgres.app and click 'Start' on the default server." >&2
  exit 1
fi

"$PG_BIN/psql" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
  END IF;
END
\$\$;

ALTER ROLE $DB_USER CREATEDB;
SQL

if ! "$PG_BIN/psql" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  "$PG_BIN/createdb" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -O "$DB_USER" "$DB_NAME"
fi

"$PG_BIN/psql" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c \
  "CREATE EXTENSION IF NOT EXISTS vector;"

echo "Postgres ready: postgres://$DB_USER:$DB_PASS@$PG_HOST:$PG_PORT/$DB_NAME"
