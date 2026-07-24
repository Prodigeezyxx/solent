import type { D1Database } from '@cloudflare/workers-types';

/**
 * LLM spend accounting — zero-LLM feature.
 *
 * Two ledgers, reconciled in /api/usage:
 *  1. Local: every model call SOLENT makes is recorded in `llm_usage`
 *     (tokens + USD cost straight from OpenRouter usage accounting —
 *     requests include `usage: { include: true }`).
 *  2. Remote: OpenRouter's own /credits + /key endpoints report the
 *     account-level balance so the operator sees real remaining credit.
 */

export interface UsageEvent {
  model: string;
  purpose: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

/** Persist one model-call usage record. Never throws (accounting must not break the product). */
export async function recordUsage(db: D1Database, ev: UsageEvent): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO llm_usage (model, purpose, prompt_tokens, completion_tokens, total_tokens, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(ev.model, ev.purpose, ev.prompt_tokens, ev.completion_tokens, ev.total_tokens, ev.cost, Date.now())
      .run();
  } catch {
    /* table missing pre-migration — non-fatal */
  }
}

/** Extract token/cost usage from an OpenRouter chat completion response body. */
export function usageFromResponse(json: any, model: string, purpose: string): UsageEvent {
  const u = json?.usage ?? {};
  return {
    model,
    purpose,
    prompt_tokens: Number(u.prompt_tokens ?? 0),
    completion_tokens: Number(u.completion_tokens ?? 0),
    total_tokens: Number(u.total_tokens ?? 0),
    cost: Number(u.cost ?? 0),
  };
}

export interface UsageSummary {
  today: { calls: number; tokens: number; cost: number };
  week: { calls: number; tokens: number; cost: number };
  all: { calls: number; tokens: number; cost: number };
  by_model: { model: string; calls: number; tokens: number; cost: number }[];
  by_purpose: { purpose: string; calls: number; tokens: number; cost: number }[];
  recent: { model: string; purpose: string; total_tokens: number; cost: number; created_at: number }[];
  daily: { day: string; calls: number; tokens: number; cost: number }[];
  credits?: { total_credits: number; total_usage: number; remaining: number };
  credits_error?: string;
}

async function bucket(db: D1Database, sinceMs: number | null): Promise<{ calls: number; tokens: number; cost: number }> {
  const q = sinceMs
    ? db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_tokens),0) t, COALESCE(SUM(cost),0) s FROM llm_usage WHERE created_at >= ?').bind(sinceMs)
    : db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_tokens),0) t, COALESCE(SUM(cost),0) s FROM llm_usage');
  const row = await q.first<{ c: number; t: number; s: number }>();
  return { calls: row?.c ?? 0, tokens: row?.t ?? 0, cost: row?.s ?? 0 };
}

export async function usageSummary(db: D1Database, apiKey?: string): Promise<UsageSummary> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 86_400_000;

  const empty = { calls: 0, tokens: 0, cost: 0 };
  let today = empty, week = empty, all = empty;
  let byModel: UsageSummary['by_model'] = [];
  let byPurpose: UsageSummary['by_purpose'] = [];
  let recent: UsageSummary['recent'] = [];
  let daily: UsageSummary['daily'] = [];

  try {
    [today, week, all] = await Promise.all([bucket(db, dayStart.getTime()), bucket(db, weekAgo), bucket(db, null)]);
    const [m, p, r, d] = await Promise.all([
      db.prepare('SELECT model, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost FROM llm_usage GROUP BY model ORDER BY cost DESC LIMIT 10').all(),
      db.prepare('SELECT purpose, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost FROM llm_usage GROUP BY purpose ORDER BY cost DESC LIMIT 10').all(),
      db.prepare('SELECT model, purpose, total_tokens, cost, created_at FROM llm_usage ORDER BY created_at DESC LIMIT 12').all(),
      db.prepare("SELECT date(created_at/1000,'unixepoch') day, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens, COALESCE(SUM(cost),0) cost FROM llm_usage WHERE created_at >= ? GROUP BY day ORDER BY day ASC").bind(Date.now() - 14 * 86_400_000).all(),
    ]);
    byModel = (m.results ?? []) as UsageSummary['by_model'];
    byPurpose = (p.results ?? []) as UsageSummary['by_purpose'];
    recent = (r.results ?? []) as UsageSummary['recent'];
    daily = (d.results ?? []) as UsageSummary['daily'];
  } catch {
    /* pre-migration */
  }

  const out: UsageSummary = { today, week, all, by_model: byModel, by_purpose: byPurpose, recent, daily };

  // Account-level truth from OpenRouter (free API call, no model credits spent).
  if (apiKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = (await res.json()) as any;
      if (res.ok && json?.data) {
        const total = Number(json.data.total_credits ?? 0);
        const used = Number(json.data.total_usage ?? 0);
        out.credits = { total_credits: total, total_usage: used, remaining: Math.max(0, total - used) };
      } else {
        out.credits_error = json?.error?.message ?? `OpenRouter ${res.status}`;
      }
    } catch (e) {
      out.credits_error = (e as Error).message;
    }
  }

  return out;
}
