-- Universal triage: every item can be sorted (dealt with) or deferred (snoozed).
-- items.seen stays for backwards compat; triage_status is the richer state.
ALTER TABLE items ADD COLUMN triage_status TEXT NOT NULL DEFAULT 'open';  -- open | sorted | deferred
ALTER TABLE items ADD COLUMN deferred_until INTEGER;                       -- epoch ms; NULL = indefinite
ALTER TABLE items ADD COLUMN triaged_at INTEGER;

-- Tasks can be deferred too.
ALTER TABLE tasks ADD COLUMN deferred_until INTEGER;

CREATE INDEX IF NOT EXISTS idx_items_triage ON items (triage_status, deferred_until);
