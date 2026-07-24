-- Open loops + context library.
--
-- 1. loops — commitments in flight. Inbound: someone asked YOU for something.
--    Outbound: YOU asked someone and are waiting. Derived deterministically
--    from items (zero LLM cost); resolvable/dismissable by the operator or
--    by CONDUCTOR tools.
-- 2. docs — operator-fed context (pasted docs, notes, strategy memos).
--    Injected compactly into the brief and CONDUCTOR prompts.

CREATE TABLE IF NOT EXISTS loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL,          -- inbound | outbound
  source TEXT NOT NULL,             -- pumble | gmail | zoho
  ref TEXT NOT NULL,                -- originating item ref
  channel TEXT,
  counterparty TEXT NOT NULL,       -- who is on the other side of the loop
  counterparty_id TEXT,
  ask TEXT NOT NULL,                -- the ask, clipped
  opened_ts TEXT,                   -- when the ask was made (message ts)
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(source, ref, direction)
);

CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status, direction);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'doc', -- doc | note
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
