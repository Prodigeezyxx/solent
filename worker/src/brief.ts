import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';
import { digestForPrompt, fetchAllSources, type SourceItem, type SourceResult } from './connectors';
import { loadSettings, type Settings } from './settings';
import { createTask, logAgentRun, logMemory } from './db';

/**
 * ONE-SHOT EXECUTIVE PASS.
 *
 * Credit-optimisation strategy:
 *  1. All source fetches (Pumble + Gmail + Zoho) are plain HTTP — zero LLM cost.
 *  2. Raw items are stripped, clipped, and capped BEFORE prompting (~40 items,
 *     ≤280 chars each), keeping the input under a few thousand tokens.
 *  3. Exactly ONE model call per run — no tool loops, no multi-round agents.
 *     The model returns a single structured JSON object covering everything:
 *     summary, priorities, signals, and suggested replies.
 *  4. Results are cached in D1 with a TTL (default 30 min). Re-opening the
 *     dashboard inside the window costs zero credits.
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
  cached: boolean;
  summary: string;
  headline: string;
  priorities: BriefPriority[];
  signals: BriefSignal[];
  replies: BriefReply[];
  sources: { source: string; configured: boolean; ok: boolean; count: number; error?: string }[];
  inbox: SourceItem[];
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

const BRIEF_SYSTEM =
  'You are CONDUCTOR, the executive function layer for the operator. You receive a raw digest of their real ' +
  'work signals (Pumble team chat, Gmail personal inbox, Zoho company inbox). In ONE pass, produce their ' +
  'executive brief as strict JSON. Rules: be ruthless about priority — only genuinely actionable items ' +
  'become priorities (max 6). Ignore newsletters, notifications, and noise. Suggested replies only for ' +
  'messages that clearly await the operator (max 3, ≤60 words each, their voice: warm, precise, outcome-driven). ' +
  'Signals are patterns worth knowing, not tasks (max 4). Reference items by their [source:n] tag in source_ref. ' +
  'Respond ONLY with JSON matching: {"headline": string (≤90 chars, the single most important thing), ' +
  '"summary": string (≤80 words, the shape of the day), ' +
  '"priorities": [{"title": string, "context": string, "urgency": "high"|"medium"|"low", "source_ref": string}], ' +
  '"signals": [{"label": "Work"|"Market"|"Network"|"Ops", "title": string, "meta": string, "score": "NN%"}], ' +
  '"replies": [{"to": string, "channel": "pumble"|"gmail"|"zoho", "re": string, "draft": string}]}';

export async function runBrief(env: Env, opts: { force?: boolean } = {}): Promise<Brief> {
  const db = env.DB;
  const settings = await loadSettings(db, env);
  const ttlMin = Math.max(1, Number(settings.BRIEF_TTL_MINUTES ?? 30));

  if (!opts.force) {
    const cached = await readCache(db, ttlMin * 60_000);
    if (cached) return cached;
  }

  // 1) Parallel, zero-credit fetch of every configured source.
  const results = await fetchAllSources(db, settings);
  const inbox = results.flatMap((r) => r.items);
  const anyConfigured = results.some((r) => r.configured);
  const digest = digestForPrompt(results);

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
      headline: `${inbox.length} items pulled — add an OpenRouter key to triage them`,
      summary: 'Sources are live and the unified inbox below is real. Set OPENROUTER_API_KEY in Sources to enable the one-shot triage pass.',
    };
    await writeCache(db, brief);
    return brief;
  }

  // 2) The single LLM call.
  const model = settings.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: BRIEF_SYSTEM },
          { role: 'user', content: `Today: ${new Date().toUTCString()}\n\nDIGEST:\n${digest}` },
        ],
      }),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message ?? `OpenRouter ${res.status}`);
    const raw: string = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));

    const brief: Brief = {
      ...base,
      model,
      headline: String(parsed.headline ?? '').slice(0, 140),
      summary: String(parsed.summary ?? ''),
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 6) : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 4) : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies.slice(0, 3) : [],
    };

    // 3) Persist outputs so the rest of the system (tasks, memory) stays in sync.
    await persistBrief(db, brief);
    await writeCache(db, brief);
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

async function persistBrief(db: D1Database, brief: Brief): Promise<void> {
  // De-dup: don't recreate tasks that already exist with the same title and are open.
  const { results } = await db.prepare('SELECT title FROM tasks WHERE done = 0').all<{ title: string }>();
  const existing = new Set((results ?? []).map((r) => r.title.toLowerCase()));
  for (const p of brief.priorities) {
    if (existing.has(p.title.toLowerCase())) continue;
    await createTask(db, p.title, p.context || p.source_ref);
  }
  if (brief.headline) {
    await logMemory(db, `Brief: ${brief.headline}`, 'ATLAS', 'one-shot brief');
  }
  await logAgentRun(db, 'CONDUCTOR', 'one_shot_brief', `${brief.priorities.length} priorities, ${brief.replies.length} drafts`);
}
