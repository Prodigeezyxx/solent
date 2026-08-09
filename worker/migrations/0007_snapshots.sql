-- BRIEF SNAPSHOTS ("timeblocks") — every executive-brief state is preserved.
--
-- Why: pulling new context REPLACES the executive summary, but the operator
-- may still be working from the previous one. Each LLM pass now auto-saves a
-- restorable snapshot, so previous states are never destroyed — browse, pin,
-- label, and restore any earlier timeblock while a new one is live.
CREATE TABLE IF NOT EXISTS brief_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at INTEGER NOT NULL,      -- when the brief was produced (epoch ms)
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  model TEXT,
  priorities_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  inbox_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,              -- the FULL Brief JSON — restorable state
  pinned INTEGER NOT NULL DEFAULT 0,  -- pinned snapshots survive pruning
  label TEXT,                         -- operator's own name for this timeblock
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_time ON brief_snapshots (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_pinned ON brief_snapshots (pinned, generated_at DESC);
