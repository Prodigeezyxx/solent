#!/usr/bin/env bash
# SOLENT — import a db-export.sh dump into THIS machine's local D1.
# Restores everything: credentials, messages, tasks, memories, triage state.
# Run once after cloning the repo on a new machine, then `npm run dev:worker`.
#
# Usage:  ./scripts/db-import.sh solent_db_export_YYYY-MM-DD.sql
#
# For a DEPLOYED worker (remote D1) use instead:
#   cd worker && npx wrangler d1 execute solent-db --remote --file=../<export>.sql
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:?usage: ./scripts/db-import.sh <export.sql>}"
[ -f "$DUMP" ] || { echo "✗ $DUMP not found" >&2; exit 1; }

D1_DIR="worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

# If local D1 has never been initialised, create it by applying migrations once.
if [ ! -d "$D1_DIR" ] || [ -z "$(find "$D1_DIR" -maxdepth 1 -name '*.sqlite' ! -name 'metadata*' 2>/dev/null)" ]; then
  echo "· No local D1 yet — initialising via migrations…"
  (cd worker && npx wrangler d1 migrations apply solent-db --local >/dev/null)
fi

DB_FILE=$(find "$D1_DIR" -maxdepth 1 -name '*.sqlite' ! -name 'metadata*' | head -1)
[ -n "$DB_FILE" ] || { echo "✗ Could not initialise local D1" >&2; exit 1; }

# Safety copy of whatever is there now.
BACKUP="${DB_FILE}.pre-import.$(date +%s).bak"
cp "$DB_FILE" "$BACKUP"

# Replace content: drop existing user tables, then replay the dump.
# The dump contains CREATE TABLE + INSERT for everything (including d1_migrations).
sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
TABLES=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%';")
for t in $TABLES; do sqlite3 "$DB_FILE" "DROP TABLE IF EXISTS \"$t\";"; done
sqlite3 "$DB_FILE" < "$DUMP"

ROWS=$(sqlite3 "$DB_FILE" "SELECT (SELECT COUNT(*) FROM items) || ' items, ' || (SELECT COUNT(*) FROM tasks) || ' tasks, ' || (SELECT COUNT(*) FROM settings) || ' settings, ' || (SELECT COUNT(*) FROM people) || ' people';" 2>/dev/null || echo "?")
echo "✓ Imported $DUMP into local D1 — $ROWS"
echo "  (pre-import state saved at $BACKUP)"
echo "  Restart the worker (npm run dev:worker / pm2 restart solent) to pick it up."
