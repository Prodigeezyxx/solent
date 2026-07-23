-- First-principles data layer:
-- 1. people    — resolved identities across sources (Pumble ids → names, email senders)
-- 2. items     — durable, normalised inbox items with attention scoring
--    (the brief cache stays a snapshot; this is the system of record)

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,            -- pumble | gmail | zoho
  ext_id TEXT NOT NULL,            -- source-native id (pumble user id, email address)
  name TEXT NOT NULL,
  email TEXT,
  title TEXT,                      -- role/title when known
  vip INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL,
  UNIQUE(source, ext_id)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  ref TEXT NOT NULL,               -- source-native message id
  channel TEXT,                    -- #channel, DM, or mail folder
  from_name TEXT NOT NULL,
  from_id TEXT,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT,
  is_dm INTEGER NOT NULL DEFAULT 0,
  mentions_me INTEGER NOT NULL DEFAULT 0,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  attention_reason TEXT,
  seen INTEGER NOT NULL DEFAULT 0, -- operator marked as handled
  created_at INTEGER NOT NULL,
  UNIQUE(source, ref)
);

CREATE INDEX IF NOT EXISTS idx_items_attention ON items(needs_attention, seen);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
