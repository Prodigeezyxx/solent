import type { D1Database } from '@cloudflare/workers-types';
import type { SourceResult } from './connectors';

/**
 * OPEN LOOPS — commitments in flight, derived deterministically (zero LLM).
 *
 *  - inbound:  someone asked YOU for something and it's unresolved
 *              ("you owe Kemi an answer — 3 days old")
 *  - outbound: YOU asked someone and are still waiting
 *              ("Bareera hasn't replied to your ask — 2 days old")
 *
 * Loops are upserted on every pass, keyed by (source, ref, direction), so
 * re-runs never duplicate. Resolution is explicit (operator click or a
 * CONDUCTOR tool call) — the system never silently forgets a commitment.
 */

export interface LoopRow {
  id: number;
  direction: 'inbound' | 'outbound';
  source: string;
  ref: string;
  channel: string | null;
  counterparty: string;
  counterparty_id: string | null;
  ask: string;
  opened_ts: string | null;
  status: string;
  created_at: number;
}

/** Which attention reasons imply an actual ask (vs mere urgency/noise). */
const INBOUND_REASON = /direct ask|question to you/;

/** Bots and app integrations never hold real commitments. */
const BOT_RE = /\b(bot|by cake\.com|google drive|clockify|plaky|calendar|notification|no.?reply|noreply|mailer|automation)\b/i;

export async function deriveLoops(db: D1Database, results: SourceResult[]): Promise<void> {
  const now = Date.now();
  const stmts = [];

  for (const r of results) {
    // INBOUND: flagged items where someone is waiting on the operator.
    for (const it of r.items) {
      if (!it.ref || !it.needsAttention) continue;
      if (!INBOUND_REASON.test(it.attentionReason ?? '')) continue;
      if (BOT_RE.test(it.from)) continue; // apps/bots don't hold commitments
      stmts.push(
        db
          .prepare(
            `INSERT INTO loops (direction, source, ref, channel, counterparty, counterparty_id, ask, opened_ts, status, created_at)
             VALUES ('inbound', ?, ?, ?, ?, ?, ?, ?, 'open', ?)
             ON CONFLICT(source, ref, direction) DO NOTHING`,
          )
          .bind(it.source, it.ref, it.channel, it.from, it.fromId ?? null, it.text, it.ts || null, now),
      );
    }
    // OUTBOUND: the operator's own unanswered asks (currently Pumble DMs).
    for (const ask of r.outbound ?? []) {
      if (!ask.ref) continue;
      stmts.push(
        db
          .prepare(
            `INSERT INTO loops (direction, source, ref, channel, counterparty, counterparty_id, ask, opened_ts, status, created_at)
             VALUES ('outbound', ?, ?, ?, ?, ?, ?, ?, 'open', ?)
             ON CONFLICT(source, ref, direction) DO NOTHING`,
          )
          .bind(ask.source, ask.ref, ask.channel, ask.counterparty, ask.counterpartyId ?? null, ask.ask, ask.ts || null, now),
      );
    }
  }

  // AUTO-CLOSE outbound loops when the counterparty has since replied:
  // if any newer inbound item exists from the same person, the wait is over.
  for (const r of results) {
    for (const it of r.items) {
      if (!it.fromId || !it.ts) continue;
      stmts.push(
        db
          .prepare(
            `UPDATE loops SET status = 'resolved', resolved_at = ?
             WHERE direction = 'outbound' AND status = 'open' AND counterparty_id = ? AND (opened_ts IS NULL OR opened_ts < ?)`,
          )
          .bind(now, it.fromId, it.ts),
      );
    }
  }

  // AUTO-CLOSE inbound loops when the OPERATOR has since replied (sent-mail
  // evidence): you answered them — you no longer owe them. This kills the
  // repetition where an already-answered ask kept nagging every pass.
  for (const r of results) {
    for (const rep of r.myReplies ?? []) {
      if (!rep.counterpartyId || !rep.ts) continue;
      stmts.push(
        db
          .prepare(
            `UPDATE loops SET status = 'resolved', resolved_at = ?
             WHERE direction = 'inbound' AND status = 'open'
               AND LOWER(counterparty_id) = LOWER(?) AND (opened_ts IS NULL OR opened_ts < ?)`,
          )
          .bind(now, rep.counterpartyId, rep.ts),
      );
    }
  }

  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

export async function listLoops(db: D1Database, limit = 40): Promise<LoopRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, direction, source, ref, channel, counterparty, counterparty_id, ask, opened_ts, status, created_at
       FROM loops WHERE status = 'open' ORDER BY COALESCE(opened_ts, '') ASC, created_at ASC LIMIT ?`,
    )
    .bind(limit)
    .all<LoopRow>();
  return results ?? [];
}

export async function setLoopStatus(db: D1Database, id: number, status: 'resolved' | 'dismissed'): Promise<void> {
  await db.prepare('UPDATE loops SET status = ?, resolved_at = ? WHERE id = ?').bind(status, Date.now(), id).run();
}

/** Compact loop context for prompts — ages included so the model can nag. */
export async function loopsForPrompt(db: D1Database, max = 10): Promise<string> {
  try {
    const loops = await listLoops(db, max);
    if (!loops.length) return '';
    const now = Date.now();
    const lines = loops.map((l) => {
      const opened = l.opened_ts ? new Date(l.opened_ts).getTime() : l.created_at;
      const days = Math.max(0, Math.floor((now - opened) / 86_400_000));
      const age = days === 0 ? 'today' : `${days}d old`;
      return l.direction === 'inbound'
        ? `- OWE ${l.counterparty} (${age}): "${l.ask.slice(0, 100)}"`
        : `- WAITING on ${l.counterparty} (${age}): "${l.ask.slice(0, 100)}"`;
    });
    return `OPEN LOOPS (unresolved commitments):\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
