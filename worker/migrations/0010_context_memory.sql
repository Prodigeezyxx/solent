-- Context Memory: persistent state across brief runs --
CREATE TABLE IF NOT EXISTS brief_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL UNIQUE,     -- hash of brief content
  user_id TEXT,                         -- optional user association
  brief_json TEXT NOT NULL,             -- serialized brief for context
  created_at INTEGER NOT NULL,          -- when this state was captured
  expires_at INTEGER                    -- optional TTL (null = evergreen)
);

CREATE TABLE IF NOT EXISTS brief_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,            -- links to brief_snapshots
  item_type TEXT NOT NULL,              -- "task", "item", "loop", "memory"
  item_id TEXT NOT NULL,                -- external reference
  action TEXT NOT NULL,                 -- "completed", "deferred", "commented", "saved"
  details TEXT,                         -- notes, timeframe, etc.
  created_at INTEGER NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES brief_snapshots(snapshot_id)
);

-- Indexes for fast lookups --
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON brief_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_snapshot ON brief_decisions(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_decisions_item ON brief_decisions(item_type, item_id);