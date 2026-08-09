import type { D1Database } from '@cloudflare/workers-types';
import { recordBriefDecision } from './contextMemory';

/**
 * Enhanced triage system: Context-Aware Priority Triage (CAPT)
 *
 * Four states:
 *   - review:     newly fetched, needs human judgment (default for new items)
 *   - quick-skip: archived - won't appear in prompts or UI again
 *   - review-later: snoozed until a specific time/condition
 *   - sorted:     handled - complete task or mark action taken
 *
 * Priority tiers:
 *   - urgent:  needs response within 24h
 *   - today:   should be handled today
 *   - soon:    window of 2-5 days
 *   - later:   general important items
 */

export type TriageAction = 'review' | 'quick-skip' | 'sorted' | 'deferred';
export type PriorityTier = 'urgent' | 'today' | 'soon' | 'later';

export interface TriageDecision {
  action: TriageAction;
  priority_tier?: PriorityTier;
  notes?: string;
}

export interface TriageLogEntry {
  item_id: number;
  action: TriageAction;
  priority_tier?: PriorityTier;
  user_id?: string;
  timestamp: number;
  notes?: string;
}

/** Custom defer scheduling */
export interface CustomDeferOptions {
  weekdays?: number[];  // 0=Sunday, 1=Monday, etc.
  time_of_day?: string;  // "09:00", "14:30", etc.
  until_datetime?: string;  // ISO 8601 timestamp
}

/**
 * Parse defer choice into a timestamp in milliseconds
 */
export function deferUntilFromChoice(choice: string, custom?: CustomDeferOptions): number | null {
  const now = Date.now();
  const h = 3_600_000;
  
  switch (choice) {
    case '3h': return now + 3 * h;
    case 'today': {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      return d.getTime();
    }
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
    case 'end_of_day': {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
    default: return now + 24 * h;
  }
}

/**
 * Calculate wake time for custom defer options
 */
export function estimateWakeTime(custom: CustomDeferOptions | undefined): number | null {
  if (!custom) return null;

  if (custom.until_datetime) {
    const ts = new Date(custom.until_datetime).getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  if (custom.time_of_day) {
    const now = new Date();
    const [hours, minutes] = custom.time_of_day.split(':').map(Number);
    const target = new Date(now);
    target.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  if (custom.weekdays && custom.weekdays.length > 0) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(9, 0, 0, 0);
    for (let i = 1; i <= 7; i++) {
      const day = (now.getDay() + i) % 7;
      if (custom.weekdays.includes(day)) {
        target.setDate(now.getDate() + i);
        break;
      }
    }
    return target.getTime();
  }

  return null;
}

/** Escape string for JSON storage */
function escapeJson(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Log triage action to audit trail */
async function logTriage(
  db: D1Database,
  itemId: number,
  action: TriageAction,
  priorityTier?: PriorityTier,
  notes?: string
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO triage_log (item_id, action, priority_tier, timestamp, notes)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(itemId, action, priorityTier ?? null, Date.now(), notes ?? null)
    .run();
}

/** Update triage_actions JSON field (D1-compatible approach) */
async function updateTriageActions(db: D1Database, id: number, action: TriageAction, priorityTier?: PriorityTier): Promise<void> {
  const now = Date.now();
  const tier = priorityTier ?? 'soon';
  const actionsJson = `{"last_action":"${action}","timestamp":${now},"priority_tier":"${tier}"}`;
  
  // For updates, we use a simpler approach - just update the fields we need
  // The triage_actions field is kept as a simple JSON string
  if (action === 'sorted') {
    // quick-skip uses skipped=1 to mark as archived
    await db
      .prepare(`
        UPDATE items SET triage_actions = ? WHERE id = ?
      `)
      .bind(actionsJson, id)
      .run();
  } else {
    await db
      .prepare(`
        UPDATE items SET triage_actions = ? WHERE id = ?
      `)
      .bind(actionsJson, id)
      .run();
  }
}

/**
 * Update triage state and log the action
 */
export async function triageItem(
  db: D1Database,
  id: number,
  action: TriageAction,
  priorityTier?: PriorityTier,
  deferChoice?: string,
  customDefer?: CustomDeferOptions,
  notes?: string
): Promise<void> {
  const now = Date.now();
  const until = action === 'deferred' 
    ? deferUntilFromChoice(deferChoice ?? '', customDefer) 
    : null;

  if (action === 'sorted') {
    await db
      .prepare(`
        UPDATE items 
        SET triage_status = 'sorted', seen = 1, triaged_at = ?, deferred_until = NULL, priority_tier = ?, skipped = 0
        WHERE id = ?
      `)
      .bind(now, priorityTier ?? 'soon', id)
      .run();
    await updateTriageActions(db, id, 'sorted', priorityTier);
    await logTriage(db, id, 'sorted', priorityTier, notes);
    // CONTEXT MEMORY: persist the resolution so subsequent brief pulls know
    // this item was handled (kills "TSL booth still pending" resurfacing).
    try {
      const snap = await db.prepare('SELECT snapshot_id FROM brief_snapshots ORDER BY created_at DESC LIMIT 1').first<{ snapshot_id: string }>();
      if (snap) await recordBriefDecision(db, snap.snapshot_id, 'item', String(id), 'completed', notes);
    } catch { /* context tables may not exist yet */ }
    
  } else if (action === 'quick-skip') {
    await db
      .prepare(`
        UPDATE items 
        SET triage_status = 'sorted', seen = 1, triaged_at = ?, priority_tier = ?, skipped = 1
        WHERE id = ?
      `)
      .bind(now, priorityTier ?? 'later', id)
      .run();
    await updateTriageActions(db, id, 'quick-skip', priorityTier);
    await logTriage(db, id, 'quick-skip', priorityTier, notes);
      
  } else if (action === 'deferred') {
    const wakeTime = estimateWakeTime(customDefer) ?? until;
    await db
      .prepare(`
        UPDATE items 
        SET triage_status = 'deferred', seen = 0, triaged_at = ?, deferred_until = ?, priority_tier = ?
        WHERE id = ?
      `)
      .bind(now, wakeTime, priorityTier ?? 'soon', id)
      .run();
    await updateTriageActions(db, id, 'deferred', priorityTier);
    await logTriage(db, id, 'deferred', priorityTier, notes);
      
  } else { // 'review' - reset to open state
    await db
      .prepare(`
        UPDATE items 
        SET triage_status = 'open', seen = 0, triaged_at = NULL, deferred_until = NULL, priority_tier = ?
        WHERE id = ?
      `)
      .bind(priorityTier ?? 'soon', id)
      .run();
    await updateTriageActions(db, id, 'review', priorityTier);
    await logTriage(db, id, 'review', priorityTier, notes);
  }
}

/** Triage an item by (source, ref) — for brief inbox without durable id lookup */
export async function triageByRef(
  db: D1Database,
  source: string,
  ref: string,
  action: TriageAction,
  deferChoice?: string,
  customDefer?: CustomDeferOptions,
  notes?: string
): Promise<number | null> {
  const row = await db.prepare('SELECT id FROM items WHERE source = ? AND ref = ?').bind(source, ref).first<{ id: number }>();
  if (!row) return null;
  await triageItem(db, row.id, action, undefined, deferChoice, customDefer, notes);
  return row.id;
}

/** Defer a task with enhanced options */
export async function deferTask(
  db: D1Database,
  id: number,
  deferChoice: string,
  customDefer?: CustomDeferOptions
): Promise<void> {
  const until = estimateWakeTime(customDefer) ?? deferUntilFromChoice(deferChoice);
  await db.prepare('UPDATE tasks SET deferred_until = ?, updated_at = ? WHERE id = ?')
    .bind(until ?? 4102444800000, Date.now(), id)
    .run();
}

/** Undefer a task */
export async function undeferTask(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE tasks SET deferred_until = NULL, updated_at = ? WHERE id = ?')
    .bind(Date.now(), id)
    .run();
}

/** Wake deferred items whose time has come */
export async function wakeDeferred(db: D1Database): Promise<number> {
  try {
    const res = await db
      .prepare(`
        UPDATE items SET triage_status = 'open', deferred_until = NULL 
        WHERE triage_status = 'deferred' AND deferred_until IS NOT NULL AND deferred_until <= ?
      `)
      .bind(Date.now())
      .run();
    return res.meta.changes ?? 0;
  } catch {
    return 0;
  }
}

/** Wake deferred tasks whose time has come */
export async function wakeDeferredTasks(db: D1Database): Promise<void> {
  try {
    await db.prepare('UPDATE tasks SET deferred_until = NULL WHERE deferred_until IS NOT NULL AND deferred_until <= ?')
      .bind(Date.now())
      .run();
  } catch {
    /* pre-migration */
  }
}

/** Map of source:ref -> triage status for brief inbox overlay */
export async function triageOverlay(db: D1Database): Promise<Record<string, { status: string; itemId: number; priorityTier?: string }>> {
  try {
    const { results } = await db
      .prepare(`
        SELECT id, source, ref, triage_status, priority_tier 
        FROM items 
        WHERE (triage_status != 'open' OR (triage_status = 'deferred' AND deferred_until > ?))
        AND created_at >= ?
      `)
      .bind(Date.now(), Date.now() - 30 * 86_400_000)
      .all<{ id: number; source: string; ref: string; triage_status: string; priority_tier?: string }>();
    
    const out: Record<string, { status: string; itemId: number; priorityTier?: string }> = {};
    for (const r of results ?? []) {
      out[`${r.source}:${r.ref}`] = { 
        status: r.triage_status, 
        itemId: r.id,
        priorityTier: r.priority_tier ?? undefined
      };
    }
    return out;
  } catch {
    return {};
  }
}

export interface TriageCounts {
  open_attention: number;
  review: number;
  deferred: number;
  sorted_today: number;
  quick_skipped: number;
}

/** Enhanced triage counts with breakdown by priority and state */
export async function triageCounts(db: D1Database): Promise<TriageCounts> {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    
    const [a, r, d, s, q] = await Promise.all([
      db.prepare("SELECT COUNT(*) c FROM items WHERE needs_attention = 1 AND triage_status = 'open'").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'review' AND created_at >= ?").bind(dayStart.getTime()).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'deferred'").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'sorted' AND triaged_at >= ?").bind(dayStart.getTime()).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) c FROM items WHERE triage_status = 'sorted' AND skipped = 1 AND triaged_at >= ?").bind(dayStart.getTime()).first<{ c: number }>(),
    ]);
    
    return { 
      open_attention: a?.c ?? 0, 
      review: r?.c ?? 0, 
      deferred: d?.c ?? 0, 
      sorted_today: s?.c ?? 0,
      quick_skipped: q?.c ?? 0
    };
  } catch {
    return { open_attention: 0, review: 0, deferred: 0, sorted_today: 0, quick_skipped: 0 };
  }
}

/** Get triage history for an item */
export async function getTriageHistory(db: D1Database, itemId: number, limit = 10): Promise<TriageLogEntry[]> {
  const { results } = await db
    .prepare('SELECT * FROM triage_log WHERE item_id = ? ORDER BY timestamp DESC LIMIT ?')
    .bind(itemId, limit)
    .all<TriageLogEntry>();
  return results ?? [];
}