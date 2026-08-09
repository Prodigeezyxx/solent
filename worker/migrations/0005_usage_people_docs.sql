-- LLM spend ledger: one row per model call (brief, chat, agent chat).
CREATE TABLE IF NOT EXISTS llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'chat',      -- brief | chat | agent:<ID>
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,              -- USD, from OpenRouter usage accounting
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage (created_at);
