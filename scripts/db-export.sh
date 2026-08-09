#!/usr/bin/env bash
# SOLENT — export the entire local D1 database (settings + credentials +
# messages + tasks + memories + triage state, everything) to one portable
# SQL file. That file CONTAINS SECRETS — it is gitignored; move it between
# machines privately (AI Drive, USB, scp), never through the repo.
#
# Usage:  ./scripts/db-export.sh [output.sql]
set -euo pipefail
cd "$(dirname "$0")/.."

D1_DIR="worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
OUT="${1:-solent_db_export_$(date +%Y-%m-%d).sql}"

if [ ! -d "$D1_DIR" ]; then
  echo "✗ No local D1 state found at $D1_DIR — has the worker ever run here?" >&2
  exit 1
fi

# The database is the (only) non-metadata sqlite file; its name is a hash.
DB_FILE=$(find "$D1_DIR" -maxdepth 1 -name '*.sqlite' ! -name 'metadata*' | head -1)
if [ -z "$DB_FILE" ]; then
  echo "✗ No D1 sqlite file found in $D1_DIR" >&2
  exit 1
fi

# Flush WAL so the dump is complete, then dump everything.
sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
sqlite3 "$DB_FILE" .dump > "$OUT"

ROWS=$(sqlite3 "$DB_FILE" "SELECT (SELECT COUNT(*) FROM items) || ' items, ' || (SELECT COUNT(*) FROM tasks) || ' tasks, ' || (SELECT COUNT(*) FROM settings) || ' settings, ' || (SELECT COUNT(*) FROM people) || ' people';" 2>/dev/null || echo "?")
echo "✓ Exported $DB_FILE"
echo "  → $OUT ($(du -h "$OUT" | cut -f1)) — $ROWS"
echo "  ⚠ This file contains your API credentials. Keep it private (it is gitignored)."
