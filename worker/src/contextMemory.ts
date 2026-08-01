import type { D1Database } from '@cloudflare/workers-types';

export interface BriefSnapshot {
  snapshot_id: string;
  created_at: number;
  brief: unknown;
}

export interface BriefDecision {
  snapshot_id: string;
  item_type: string;
  item_id: string;
  action: string;
  details?: string;
  created_at: number;
}

/** Generate a stable hash for brief content to enable comparison */
async function hashBrief(brief: unknown): Promise<string> {
  const str = JSON.stringify(brief as object, Object.keys(brief as object).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Store a brief snapshot for future context */
export async function storeBriefSnapshot(
  db: D1Database,
  brief: unknown,
  ttlHours?: number
): Promise<string> {
  const snapshot_id = await hashBrief(brief);
  const now = Date.now();
  const expires_at = ttlHours ? now + (ttlHours * 3600000) : null;
  
  await db
    .prepare(`
      INSERT OR IGNORE INTO brief_snapshots (snapshot_id, brief_json, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `)
    .bind(snapshot_id, JSON.stringify(brief), now, expires_at)
    .run();
  
  // Clean expired snapshots older than 7 days
  await db.prepare(`
    DELETE FROM brief_snapshots 
    WHERE expires_at IS NOT NULL AND expires_at < ? AND created_at < ?
  `).bind(now, now - 7 * 86400000).run();
  
  return snapshot_id;
}

/** Record a user decision on an item */
export async function recordBriefDecision(
  db: D1Database,
  snapshot_id: string,
  item_type: string,
  item_id: string,
  action: string,
  details?: string
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO brief_decisions (snapshot_id, item_type, item_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(snapshot_id, item_type, item_id, action, details || '', Date.now())
    .run();
}

/** Get recent brief snapshots for context */
export async function getRecentBriefs(
  db: D1Database,
  limit: number = 3,
  sinceTimestamp?: number
): Promise<BriefSnapshot[]> {
  const { results } = await db
    .prepare(`
      SELECT snapshot_id, brief_json, created_at
      FROM brief_snapshots 
      WHERE (? IS NULL OR created_at >= ?)
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(sinceTimestamp || null, sinceTimestamp || 0, limit)
    .all<{ snapshot_id: string; brief_json: string; created_at: number }>();
  
  return (results ?? []).map(r => ({
    snapshot_id: r.snapshot_id,
    created_at: r.created_at,
    brief: JSON.parse(r.brief_json)
  }));
}

/** Check if an item was already handled in recent context */
export async function checkItemHandled(
  db: D1Database,
  item_type: string,
  item_id: string
): Promise<{ handled: boolean; reason?: string; when?: number }> {
  const { results } = await db
    .prepare(`
      SELECT action, created_at
      FROM brief_decisions 
      WHERE item_type = ? AND item_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(item_type, item_id)
    .all<{ action: string; created_at: number }>();
  
  if (!results || results.length === 0) {
    return { handled: false };
  }
  
  return {
    handled: true,
    reason: results[0].action,
    when: results[0].created_at
  };
}

/** Get all decisions for an item (history) */
export async function getItemHistory(
  db: D1Database,
  item_type: string,
  item_id: string
): Promise<BriefDecision[]> {
  const { results } = await db
    .prepare(`
      SELECT action, details, created_at
      FROM brief_decisions 
      WHERE item_type = ? AND item_id = ?
      ORDER BY created_at DESC
    `)
    .bind(item_type, item_id)
    .all<{ action: string; details: string; created_at: number }>();
  
  return (results ?? []).map(r => ({
    snapshot_id: '',
    item_type: r.action,
    item_id,
    action: r.action,
    details: r.details || undefined,
    created_at: r.created_at
  }));
}