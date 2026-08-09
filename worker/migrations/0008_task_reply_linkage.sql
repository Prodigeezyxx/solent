-- Link generated tasks to their originating communication so sent-message
-- evidence can complete the exact task deterministically.
ALTER TABLE tasks ADD COLUMN source TEXT;
ALTER TABLE tasks ADD COLUMN source_ref TEXT;
ALTER TABLE tasks ADD COLUMN counterparty_id TEXT;
ALTER TABLE tasks ADD COLUMN auto_completed_at INTEGER;
ALTER TABLE tasks ADD COLUMN completion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_source_ref ON tasks (source, source_ref, done);
CREATE INDEX IF NOT EXISTS idx_tasks_counterparty ON tasks (counterparty_id, done);
