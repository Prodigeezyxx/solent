import type { D1Database } from '@cloudflare/workers-types';

/**
 * Universal triage — system-wide "sorted / deferred" state.
 *
 * Every prompt, message, notice or task the system shows can be acted on:
 *   - sorted:   dealt with — disappears from every active surface
 *   - deferred: snoozed until a time (or indefinitely) — hidden until due
 *   - open:     the default; deferred items whose time has come are re-opened
 *
 * One state, reflected everywhere: attention queue, unified inbox, agent
 * panes, the knowledge graph, open loops, and the brief digest all read the
 * same columns. Zero LLM cost.
 */

export type TriageAction = 'sorted' | 'deferred' | 'reopen';

/** Standard defer windows the UI offers. */
export function deferUntilFromChoice(choice: string): number | null {
  const now = Date.now();
  const h = 3_600_000;
  switch (choice) {
    case '3h': return now + 3 * h;
    case 'tomorrow': {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
    case 'nextweek': {
      const d = new Date();
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
    case 'indefinite': return null;
    default: return now + 24 * h;
  }
}

/** Re-open any deferred items whose time has come. Call before reads. */
export async function wakeDeferred(db: D1Database): Promise<number> {
  try {
    const res = await db
      .prepare("UPDATE items SET triage_status = 'open', deferred_until = NULL WHERE triage_status = 'deferred' AND deferred_until IS NOT NULL AND deferred_until <= ?")
      .bind(Date.now())
      .run();
    return res.meta.changes ?? 0;
  } catch {
    return 0;
  }
}

export async function triageItem(db: D1Database, id: number, action: TriageAction, deferChoice?: string): Promise<void> {
  if (action === 'sorted') {
    await db
      .prepare("UPDATE items SET triage_status = 'sorted', seen = 1, triaged_at = ?, deferred_until = NULL WHERE id = ?")
      .bind(Date.now(), id)
      .run();
  } else if (action === 'deferred') {
    const until = deferUntilFromChoice(deferChoice ?? '');
    await db
      .prepare("UPDATE items SET triage_status = 'deferred', seen = 0, triaged_at = ?, deferred_until = ? WHERE id = ?")
      .bind(Date.now(), until, id)
      .run();
  } else {
    await db
      .prepare("UPDATE items SET triage_status = 'open', seen = 0, triaged_at = NULL, deferred_until = NULL WHERE id = ?")
      .bind(id)
      .run();
  }
}

/** Triage an item by (source, ref) — lets the brief inbox act without a durable id lookup on the client. */
export async function triageByRef(db: D1Database, source: string, ref: string, action: TriageAction, deferChoice?: string): Promise<number | null> {
  const row = await db.prepare('SELECT id FROM items WHERE source = ? AND ref = ?').bind(source, ref).first<{ id: number }>();
  if (!row) return null;
  await triageItem(db, row.id, action, deferChoice);
  return row.id;
}

export async function deferTask(db: D1Database, id: number, deferChoice: string): Promise<void> {
  const until = deferUntilFromChoice(deferChoice);
  await db.prepare('UPDATE tasks SET deferred_until = ?, updated_at = ? WHERE id = ?').bind(until ?? 4102444800000, Date.now(), id).run();
}

export async function undeferTask(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE tasks SET deferred_until = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
}

/** Wake deferred tasks whose time has come. */
export async function wakeDeferredTasks(db: D1Database): Promise<void> {
  try {
    await db.prepare('UPDATE tasks SET deferred_until = NULL WHERE deferred_until IS NOT NULL AND deferred_until <= ?').bind(Date.now()).run();
  } catch {
    /* pre-migration */
  }
}

/** Map of source:ref -> triage status, used to overlay state onto the brief's inbox. */
export async function triageOverlay(db: D1Database): Promise<Record<string, { status: string; itemId: number }>> {
  try {
    const { results } = await db
      .prepare("SELECT id, source, ref, triage_status FROM items WHERE triage_status != 'open' AND created_at >= ?")
      .bind(Date.now() - 30 * 86_400_000)
      .all<{ id: number; source: string; ref: string; triage_status: string }>();
    const out: Record<string, { status: string; itemId: number }> = {};
    for (const r of results ?? []) out[`${r.source}:${r.ref}`] = { status: r.triage_status, itemId: r.id };
    return out;
  } catch {
    return {};
  }
}

export interface TriageCounts {
  open_attention: number;
  deferred: number;
  sorted_today: number;
}

export async function triageCounts(db: D1Database): Promise<TriageCounts> {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [a, d, s] = await Promise.all([
      db.prepare("SELECT COUNT(*) c FROM items WHERE needs_attention = 1 AND triage_status = 'open'").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'deferred'").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'sorted' AND triaged_at >= ?").bind(dayStart.getTime()).first<{ c: number }>(),
    ]);
    return { open_attention: a?.c ?? 0, deferred: d?.c ?? 0, sorted_today: s?.c ?? 0 };
  } catch {
    return { open_attention: 0, deferred: 0, sorted_today: 0 };
  }
}
