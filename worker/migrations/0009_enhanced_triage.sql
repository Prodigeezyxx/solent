-- Enhanced triage: priority tiers + audit trail
-- PART 1: Add new columns to items table
ALTER TABLE items ADD COLUMN priority_tier TEXT DEFAULT 'soon';        -- urgent|today|soon|later
ALTER TABLE items ADD COLUMN triage_actions TEXT DEFAULT '{}';       -- JSON object of {last_action, timestamp, priority_tier}
ALTER TABLE items ADD COLUMN skipped INTEGER DEFAULT 0;                 -- for quick-skip archiving

-- PART 2: Create triage log for audit trail
CREATE TABLE IF NOT EXISTS triage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  action TEXT NOT NULL,                       -- review, quick-skip, sorted, deferred
  priority_tier TEXT,                         -- urgent|today|soon|later
  user_id TEXT,                               -- optional user identifier
  timestamp INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_triage_log_item ON triage_log(item_id);
CREATE INDEX IF NOT EXISTS idx_triage_log_timestamp ON triage_log(timestamp);

-- PART 3: Add priority index for faster query
CREATE INDEX IF NOT EXISTS idx_items_priority_triage ON items(priority_tier, triage_status, needs_attention, seen);