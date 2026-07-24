import type { D1Database } from '@cloudflare/workers-types';
import type { Brief } from './brief';

/**
 * BRIEF SNAPSHOTS — "timeblocks".
 *
 * Problem this solves: every new pass REPLACES the executive summary, but the
 * operator may still be exploring the previous one. So every generated brief
 * is auto-saved as a restorable snapshot. Nothing is destroyed by pulling new
 * context — previous states can be browsed, pinned, labelled, and restored.
 *
 * Retention: unpinned snapshots are pruned past KEEP_UNPINNED (newest kept);
 * pinned snapshots are kept forever.
 */

const KEEP_UNPINNED = 40;

export interface SnapshotMeta {
  id: number;
  generated_at: number;
  headline: string;
  summary: string;
  model: string | null;
  priorities_count: number;
  replies_count: number;
  needs_attention: number;
  inbox_count: number;
  pinned: number;
  label: string | null;
  created_at: number;
}

/** Auto-save a brief state. Called on every LLM pass — never blocks the brief. */
export async function saveSnapshot(db: D1Database, brief: Brief): Promise<void> {
  await db
    .prepare(
      `INSERT INTO brief_snapshots
        (generated_at, headline, summary, model, priorities_count, replies_count, needs_attention, inbox_count, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      brief.generated_at,
      brief.headline ?? '',
      brief.summary ?? '',
      brief.model ?? null,
      brief.priorities?.length ?? 0,
      brief.replies?.length ?? 0,
      brief.needs_attention ?? 0,
      brief.inbox?.length ?? 0,
      JSON.stringify(brief),
      Date.now(),
    )
    .run();
  // Prune: keep the newest KEEP_UNPINNED unpinned snapshots; pinned are immortal.
  await db
    .prepare(
      `DELETE FROM brief_snapshots WHERE pinned = 0 AND id NOT IN (
         SELECT id FROM brief_snapshots WHERE pinned = 0 ORDER BY generated_at DESC LIMIT ?
       )`,
    )
    .bind(KEEP_UNPINNED)
    .run();
}

/** List snapshot metadata, newest first (payload excluded — it can be large). */
export async function listSnapshots(db: D1Database, limit = 30): Promise<SnapshotMeta[]> {
  const { results } = await db
    .prepare(
      `SELECT id, generated_at, headline, summary, model, priorities_count, replies_count,
              needs_attention, inbox_count, pinned, label, created_at
       FROM brief_snapshots ORDER BY pinned DESC, generated_at DESC LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 100))
    .all<SnapshotMeta>();
  return results ?? [];
}

/** Fetch one snapshot's FULL brief payload — the restorable state. */
export async function getSnapshot(db: D1Database, id: number): Promise<{ meta: SnapshotMeta; brief: Brief } | null> {
  const row = await db
    .prepare('SELECT * FROM brief_snapshots WHERE id = ?')
    .bind(id)
    .first<SnapshotMeta & { payload: string }>();
  if (!row) return null;
  const { payload, ...meta } = row;
  try {
    return { meta, brief: JSON.parse(payload) as Brief };
  } catch {
    return null;
  }
}

/** Toggle pin (pinned snapshots survive pruning). Returns the new state. */
export async function pinSnapshot(db: D1Database, id: number): Promise<boolean> {
  await db.prepare('UPDATE brief_snapshots SET pinned = 1 - pinned WHERE id = ?').bind(id).run();
  const row = await db.prepare('SELECT pinned FROM brief_snapshots WHERE id = ?').bind(id).first<{ pinned: number }>();
  return !!row?.pinned;
}

/** Give a timeblock the operator's own name ("pre-TSL call state", …). */
export async function labelSnapshot(db: D1Database, id: number, label: string): Promise<void> {
  await db.prepare('UPDATE brief_snapshots SET label = ? WHERE id = ?').bind(label.slice(0, 120), id).run();
}

export async function deleteSnapshot(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM brief_snapshots WHERE id = ?').bind(id).run();
}
