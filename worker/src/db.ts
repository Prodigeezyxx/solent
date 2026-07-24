import type { D1Database } from '@cloudflare/workers-types';

export interface TaskRow {
  id: number;
  title: string;
  context: string | null;
  time: string | null;
  done: number;
  priority: number;
  deferred_until?: number | null;
  created_at: number;
  updated_at: number;
}

export interface MemoryRow {
  id: number;
  content: string;
  agent: string;
  source: string | null;
  created_at: number;
}

const now = () => Date.now();

export async function listTasks(db: D1Database): Promise<TaskRow[]> {
  try {
    const { results } = await db
      .prepare('SELECT * FROM tasks WHERE deferred_until IS NULL ORDER BY priority DESC, done ASC, created_at DESC')
      .all<TaskRow>();
    return results ?? [];
  } catch {
    // pre-migration fallback
    const { results } = await db
      .prepare('SELECT * FROM tasks ORDER BY priority DESC, done ASC, created_at DESC')
      .all<TaskRow>();
    return results ?? [];
  }
}

export async function createTask(db: D1Database, title: string, context?: string): Promise<TaskRow> {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const { results } = await db
    .prepare(
      'INSERT INTO tasks (title, context, time, done, priority, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?) RETURNING *',
    )
    .bind(title, context ?? null, t, now(), now())
    .all<TaskRow>();
  return (results ?? [])[0];
}

export async function toggleTask(db: D1Database, id: number): Promise<TaskRow | null> {
  await db
    .prepare('UPDATE tasks SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?')
    .bind(now(), id)
    .run();
  const { results } = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).all<TaskRow>();
  return (results ?? [])[0] ?? null;
}

export async function logMemory(db: D1Database, content: string, agent: string, source?: string): Promise<void> {
  await db
    .prepare('INSERT INTO memories (content, agent, source, created_at) VALUES (?, ?, ?, ?)')
    .bind(content, agent, source ?? null, now())
    .run();
}

export async function logDecision(db: D1Database, title: string, rationale: string, agent: string): Promise<void> {
  await db
    .prepare('INSERT INTO decisions (title, rationale, agent, created_at) VALUES (?, ?, ?, ?)')
    .bind(title, rationale, agent, now())
    .run();
}

export async function logAgentRun(db: D1Database, agent: string, action: string, detail?: string): Promise<void> {
  await db
    .prepare('INSERT INTO agent_runs (agent, action, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(agent, action, detail ?? null, now())
    .run();
}

export async function recentMemories(db: D1Database, limit = 5): Promise<MemoryRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM memories ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<MemoryRow>();
  return results ?? [];
}
