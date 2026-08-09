-- Runtime settings / connector credentials / small caches.
-- Secrets stored here are write-only through the API (never echoed back).

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
