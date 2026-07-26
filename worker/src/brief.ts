import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';
import { digestForPrompt, fetchAllSources, persistPass, type SourceCoverage, type SourceItem, type SourceResult } from './connectors';
import { saveSnapshot } from './snapshots';
import { loadSettings, type Settings } from './settings';
import { createTask, logAgentRun, logMemory } from './db';
import { deriveLoops, loopsForPrompt } from './loops';
import { docsForPrompt } from './docs';
import { recordUsage, usageFromResponse } from './usage';

/**
 * ONE-SHOT EXECUTIVE PASS.
 *
 * Credit strategy (unchanged): parallel zero-credit fetches → condensed
 * digest → exactly ONE model call → D1 cache with TTL.
 *
 * New in this layer:
 *  - Identity-resolved digest (real names, channels, DM/mention/attention flags)
 *  - Durable persistence of people + items (system of record beyond the cache)
 *  - Operator personalisation (OPERATOR_NAME / OPERATOR_CONTEXT)
 *  - Model-agnostic JSON handling: works with strict-JSON models (Claude,
 *    GPT) AND models without response_format support (e.g. Kimi K2 via
 *    OpenRouter) via tolerant extraction + automatic retry without the flag.
 */

export interface BriefPriority {
  title: string;
  context: string;
  urgency: 'high' | 'medium' | 'low';
  source_ref: string;
}

export interface BriefSignal {
  label: string;
  title: string;
  meta: string;
  score: string;
}

export interface BriefReply {
  to: string;
  channel: string;
  re: string;
  draft: string;
}

export interface Brief {
  generated_at: number;
  /** Last zero-LLM source refresh — inbox is never older than this. */
  refreshed_at?: number;
  cached: boolean;
  summary: string;
  headline: string;
  priorities: BriefPriority[];
  signals: BriefSignal[];
  replies: BriefReply[];
  sources: {
    source: string;
    configured: boolean;
    ok: boolean;
    count: number;
    error?: string;
    /** COVERAGE LEDGER — fetched vs available, so nothing is dropped silently. */
    coverage?: SourceCoverage;
  }[];
  inbox: SourceItem[];
  needs_attention: number;
  model?: string;
  error?: string;
}

const BRIEF_KEY = '_brief_cache';

function sourceMeta(results: SourceResult[]) {
  return results.map((r) => ({
    source: r.source,
    configured: r.configured,
    ok: r.ok,
    count: r.items.length,
    error: r.error,
    coverage: r.coverage,
  }));
}

async function readCache(db: D1Database, ttlMs: number): Promise<Brief | null> {
  try {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(BRIEF_KEY).first<{ value: string }>();
    if (!row) return null;
    const brief = JSON.parse(row.value) as Brief;
    if (Date.now() - brief.generated_at < ttlMs) return { ...brief, cached: true };
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(db: D1Database, brief: Brief): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(BRIEF_KEY, JSON.stringify(brief))
    .run();
}

function briefSystem(s: Settings): string {
  const name = s.OPERATOR_NAME?.trim() || 'the operator';
  const ctx = s.OPERATOR_CONTEXT?.trim();
  return (
    `You are CONDUCTOR, the executive function layer for ${name}.` +
    (ctx ? ` Operator context: ${ctx}.` : '') +
    ' You receive a raw digest of their real work signals (Pumble team chat, Gmail personal inbox, Zoho company inbox, Google Calendar schedule). ' +
    'GCAL items are upcoming events — weave them into the day’s shape: flag conflicts with priorities, prep needed before meetings, and RSVPs awaiting a response. ' +
    'Items flagged DM, MENTIONS-YOU, or ATTN(...) were pre-screened as likely needing the operator — weigh them heavily. ' +
    'Items flagged ALREADY-REPLIED were ANSWERED by the operator since arriving — never make them priorities, never draft replies to them; mention only if the thread needs a follow-up beyond the sent reply. ' +
    'An EXISTING OPEN TASKS block lists what is already on the queue — do NOT re-propose those as priorities (even reworded); only genuinely NEW actionable items become priorities. ' +
    'If an OPERATOR CONTEXT LIBRARY block is present, treat it as ground truth about the business. ' +
    'If OPEN LOOPS are present, oldest unresolved commitments deserve priority — nag about anything > 2 days old. ' +
    'In ONE pass, produce their executive brief as strict JSON. Rules: be ruthless about priority — only genuinely actionable items ' +
    'become priorities (up to 10 when the inbox genuinely warrants it). Ignore newsletters, notifications, and noise. Suggested replies for ' +
    `every message that clearly awaits ${name} (up to 5, ≤80 words each, their voice: warm, precise, outcome-driven). ` +
    'Signals are patterns worth knowing, not tasks (up to 6 — cross-reference threads, spot trends across sources). Reference items by their [source:n] tag in source_ref. ' +
    'Think deeply: connect related items across Pumble/Gmail/Zoho, surface commitments implied but not stated, and flag anything time-sensitive. ' +
    'Respond ONLY with JSON matching: {"headline": string (≤90 chars, the single most important thing), ' +
    '"summary": string (≤80 words, the shape of the day), ' +
    '"priorities": [{"title": string, "context": string, "urgency": "high"|"medium"|"low", "source_ref": string}], ' +
    '"signals": [{"label": "Work"|"Market"|"Network"|"Ops", "title": string, "meta": string, "score": "NN%"}], ' +
    '"replies": [{"to": string, "channel": "pumble"|"gmail"|"zoho", "re": string, "draft": string}]}'
  );
}

/**
 * Model-agnostic JSON extraction. Kimi K2 and other models sometimes wrap
 * JSON in prose or code fences even when asked not to.
 */
export function extractJson(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON object in model output');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('Unbalanced JSON in model output');
}

/**
 * One OpenRouter chat call. Model-agnostic:
 *  - retries without response_format if the model rejects it (Kimi-safe)
 *  - optional reasoning effort for reasoning models (Kimi K3, R1, o-series)
 *  - retries without reasoning if the route rejects that too
 */
async function callModel(apiKey: string, model: string, system: string, user: string, reasoning?: string, db?: D1Database): Promise<string> {
  const payload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: 4000,
    usage: { include: true }, // OpenRouter: return exact cost accounting with the response
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const effort = reasoning && reasoning !== 'off' ? reasoning : undefined;
  const attempt = async (withFormat: boolean, withReasoning: boolean) => {
    const body: Record<string, unknown> = { ...payload };
    if (withFormat) body.response_format = { type: 'json_object' };
    if (withReasoning && effort) body.reasoning = { effort };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message ?? `OpenRouter ${res.status}`);
    if (db) await recordUsage(db, usageFromResponse(json, model, 'brief'));
    return String(json.choices?.[0]?.message?.content ?? '');
  };
  try {
    return await attempt(true, true);
  } catch (e) {
    const msg = (e as Error).message.toLowerCase();
    // Some models reject response_format or reasoning params — degrade gracefully.
    if (msg.includes('response_format') || msg.includes('json_object') || msg.includes('not supported')) {
      try {
        return await attempt(false, true);
      } catch (e2) {
        const m2 = (e2 as Error).message.toLowerCase();
        if (m2.includes('reasoning')) return attempt(false, false);
        throw e2;
      }
    }
    if (msg.includes('reasoning')) return attempt(true, false);
    throw e;
  }
}

/**
 * ZERO-LLM SOURCE REFRESH (stale-while-revalidate).
 *
 * The LLM analysis (headline/priorities/replies) is cached for BRIEF_TTL_MINUTES,
 * but the INBOX must never go stale — a new email arriving mid-window has to
 * surface immediately. When a cached brief's sources are older than the
 * freshness window (BRIEF_FRESHNESS_MINUTES, default 3), we re-pull all
 * sources for free, persist new items (so attention/triage/graph see them),
 * and merge the fresh inbox into the cached brief — no model call, no credits.
 */
async function refreshSources(db: D1Database, settings: Settings, cached: Brief): Promise<Brief> {
  try {
    const { results, people } = await fetchAllSources(db, settings);
    const inbox = results.flatMap((r) => r.items);
    // A total fetch wipe-out (every configured source erroring) should not
    // replace a good cached inbox with nothing — keep the cache untouched.
    const anyOk = results.some((r) => r.configured && r.ok);
    if (!anyOk && cached.inbox.length > 0) return cached;
    try { await persistPass(db, results, people); } catch { /* non-fatal */ }
    try { await deriveLoops(db, results); } catch { /* non-fatal */ }
    const merged: Brief = {
      ...cached,
      refreshed_at: Date.now(),
      sources: sourceMeta(results),
      inbox,
      needs_attention: inbox.filter((i) => i.needsAttention).length,
    };
    await writeCache(db, merged);
    return { ...merged, cached: true };
  } catch {
    return cached; // refresh is best-effort — a cached brief always wins over an error
  }
}

export async function runBrief(env: Env, opts: { force?: boolean } = {}): Promise<Brief> {
  const db = env.DB;
  const settings = await loadSettings(db, env);
  const ttlMin = Math.max(1, Number(settings.BRIEF_TTL_MINUTES ?? 30));
  const freshMin = Math.max(1, Number(settings.BRIEF_FRESHNESS_MINUTES ?? 3));

  if (!opts.force) {
    const cached = await readCache(db, ttlMin * 60_000);
    if (cached) {
      const lastPull = cached.refreshed_at ?? cached.generated_at;
      if (Date.now() - lastPull > freshMin * 60_000) {
        return refreshSources(db, settings, cached); // zero-LLM: inbox stays live
      }
      return cached;
    }
  }

  // 1) Parallel, zero-credit fetch with identity resolution.
  const { results, people } = await fetchAllSources(db, settings);
  const inbox = results.flatMap((r) => r.items);
  const needsAttention = inbox.filter((i) => i.needsAttention).length;
  const anyConfigured = results.some((r) => r.configured);
  const digest = digestForPrompt(results);

  // 2) Persist people + items durably, then derive open loops (all zero-LLM).
  try {
    await persistPass(db, results, people);
  } catch {
    /* tables may not exist before migration — non-fatal */
  }
  try {
    await deriveLoops(db, results);
  } catch {
    /* loops table may not exist before migration — non-fatal */
  }

  const base: Brief = {
    generated_at: Date.now(),
    cached: false,
    summary: '',
    headline: '',
    priorities: [],
    signals: [],
    replies: [],
    sources: sourceMeta(results),
    inbox,
    needs_attention: needsAttention,
  };

  if (!anyConfigured) {
    return {
      ...base,
      headline: 'No sources connected yet',
      summary:
        'Connect Pumble, Gmail, or Zoho Mail in Sources to activate the executive layer. Once connected, one pass pulls everything, triages it, and drafts your replies.',
    };
  }

  if (inbox.length === 0) {
    const failed = results.filter((r) => r.configured && !r.ok);
    const brief = failed.length
      ? {
          ...base,
          headline: `${failed.map((f) => f.source).join(' + ')} connection failed — check Sources`,
          summary: failed.map((f) => `${f.source}: ${f.error}`).join(' · '),
        }
      : {
          ...base,
          headline: 'All quiet across your sources',
          summary: 'Nothing new in Pumble or your inboxes for this window. No credits were spent — the model is only called when there is something to triage.',
        };
    await writeCache(db, brief);
    return brief;
  }

  if (!settings.OPENROUTER_API_KEY) {
    const brief = {
      ...base,
      headline: `${inbox.length} items pulled (${needsAttention} need you) — add a model key to triage`,
      summary: 'Sources are live and the unified inbox is real. Set OPENROUTER_API_KEY in Sources to enable the one-shot triage pass.',
    };
    await writeCache(db, brief);
    return brief;
  }

  // 3) The single LLM call.
  const model = settings.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  try {
    const [loopCtx, docCtx] = await Promise.all([loopsForPrompt(db, 8), docsForPrompt(db, 3000)]);
    // EXISTING TASKS in the prompt — the model sees the queue, so it stops
    // re-proposing the same work in new words every pass.
    let taskCtx = '';
    try {
      const { results: openTasks } = await db
        .prepare('SELECT title FROM tasks WHERE done = 0 ORDER BY created_at DESC LIMIT 25')
        .all<{ title: string }>();
      if (openTasks?.length) {
        taskCtx = `EXISTING OPEN TASKS (already queued — do NOT re-propose):\n${openTasks.map((t) => `- ${t.title}`).join('\n')}`;
      }
    } catch { /* non-fatal */ }
    const userMsg = [
      `Today: ${new Date().toUTCString()}`,
      docCtx,
      loopCtx,
      taskCtx,
      `DIGEST:\n${digest}`,
    ].filter(Boolean).join('\n\n');
    const raw = await callModel(
      settings.OPENROUTER_API_KEY,
      model,
      briefSystem(settings),
      userMsg,
      settings.OPENROUTER_REASONING,
      db,
    );
    const parsed = extractJson(raw);

    const brief: Brief = {
      ...base,
      model,
      headline: String(parsed.headline ?? '').slice(0, 140),
      summary: String(parsed.summary ?? ''),
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 10) : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 6) : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies.slice(0, 5) : [],
    };

    await persistBrief(db, brief);
    await writeCache(db, brief);
    // TIMEBLOCK: auto-save this state so pulling new context never destroys
    // the summary the operator may still be exploring. Non-fatal by design.
    try { await saveSnapshot(db, brief); } catch { /* table may predate migration */ }
    return brief;
  } catch (e) {
    const brief: Brief = {
      ...base,
      headline: `${inbox.length} items pulled — triage failed`,
      summary: 'Sources fetched fine but the model call failed. The raw unified inbox is still below.',
      error: (e as Error).message,
    };
    return brief;
  }
}

/**
 * FUZZY TASK DEDUP — kills the repetition where each pass re-creates the
 * same task with slightly different wording ("Reply to Jack on founding PM
 * leads" vs "Respond to Jack on founding-PM leads"). Titles are normalised
 * (lowercase, punctuation stripped, interchangeable action verbs collapsed)
 * and compared by token overlap — ≥60% shared significant tokens = same task.
 */
const TASK_STOPWORDS = new Set([
  'reply', 'respond', 'answer', 'follow', 'following', 'followup', 'follow-up', 'send', 'confirm',
  'check', 'review', 'close', 'resolve', 'submit', 'chase', 'up', 'on', 'to', 'the', 'a', 'an',
  'with', 'for', 'and', 'of', 'in', 'at', 'his', 'her', 'their', 'your', 'my', 'out', 'about', 're',
]);

function taskTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !TASK_STOPWORDS.has(w)),
  );
}

function sameTask(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size) >= 0.6;
}

async function persistBrief(db: D1Database, brief: Brief): Promise<void> {
  // Compare against open tasks AND recently-completed ones (7 days) — a task
  // you finished this morning must not respawn from the afternoon pass.
  const weekAgo = Date.now() - 7 * 86_400_000;
  const { results } = await db
    .prepare('SELECT title FROM tasks WHERE done = 0 OR updated_at > ?')
    .bind(weekAgo)
    .all<{ title: string }>();
  const existing = (results ?? []).map((r) => taskTokens(r.title));
  for (const p of brief.priorities) {
    const tokens = taskTokens(p.title);
    if (existing.some((e) => sameTask(e, tokens))) continue;
    existing.push(tokens); // also dedup within this batch of priorities
    await createTask(db, p.title, p.context || p.source_ref);
  }
  if (brief.headline) {
    await logMemory(db, `Brief: ${brief.headline}`, 'ATLAS', 'one-shot brief');
  }
  await logAgentRun(db, 'CONDUCTOR', 'one_shot_brief', `${brief.priorities.length} priorities, ${brief.replies.length} drafts, ${brief.needs_attention} flagged`);
}
