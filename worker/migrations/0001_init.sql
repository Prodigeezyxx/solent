-- NEXUS command centre persistence layer
-- One workspace for the prototype; ready to be extended with per-user workspaces.

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  context TEXT,
  time TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  agent TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  rationale TEXT,
  agent TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,          -- 'user' | 'assistant' | 'system' | 'agent'
  agent TEXT,                  -- which agent emitted this (nullable)
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
