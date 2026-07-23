import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';
import { digestForPrompt, fetchAllSources, persistPass, type SourceItem, type SourceResult } from './connectors';
import { loadSettings, type Settings } from './settings';
import { createTask, logAgentRun, logMemory } from './db';

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
  cached: boolean;
  summary: string;
  headline: string;
  priorities: BriefPriority[];
  signals: BriefSignal[];
  replies: BriefReply[];
  sources: { source: string; configured: boolean; ok: boolean; count: number; error?: string }[];
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
    ' You receive a raw digest of their real work signals (Pumble team chat, Gmail personal inbox, Zoho company inbox). ' +
    'Items flagged DM, MENTIONS-YOU, or ATTN(...) were pre-screened as likely needing the operator — weigh them heavily. ' +
    'In ONE pass, produce their executive brief as strict JSON. Rules: be ruthless about priority — only genuinely actionable items ' +
    'become priorities (max 6). Ignore newsletters, notifications, and noise. Suggested replies only for ' +
    `messages that clearly await ${name} (max 3, ≤60 words each, their voice: warm, precise, outcome-driven). ` +
    'Signals are patterns worth knowing, not tasks (max 4). Reference items by their [source:n] tag in source_ref. ' +
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

/** One OpenRouter chat call; retries without response_format if the model rejects it (Kimi-safe). */
async function callModel(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const payload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: 1600,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const attempt = async (withFormat: boolean) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(withFormat ? { ...payload, response_format: { type: 'json_object' } } : payload),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error?.message ?? `OpenRouter ${res.status}`);
    return String(json.choices?.[0]?.message?.content ?? '');
  };
  try {
    return await attempt(true);
  } catch (e) {
    const msg = (e as Error).message.toLowerCase();
    // Some models (incl. certain Kimi/Moonshot routes) reject response_format — retry plain.
    if (msg.includes('response_format') || msg.includes('json_object') || msg.includes('not supported')) {
      return attempt(false);
    }
    throw e;
  }
}

export async function runBrief(env: Env, opts: { force?: boolean } = {}): Promise<Brief> {
  const db = env.DB;
  const settings = await loadSettings(db, env);
  const ttlMin = Math.max(1, Number(settings.BRIEF_TTL_MINUTES ?? 30));

  if (!opts.force) {
    const cached = await readCache(db, ttlMin * 60_000);
    if (cached) return cached;
  }

  // 1) Parallel, zero-credit fetch with identity resolution.
  const { results, people } = await fetchAllSources(db, settings);
  const inbox = results.flatMap((r) => r.items);
  const needsAttention = inbox.filter((i) => i.needsAttention).length;
  const anyConfigured = results.some((r) => r.configured);
  const digest = digestForPrompt(results);

  // 2) Persist people + items durably (identity layer + system of record).
  try {
    await persistPass(db, results, people);
  } catch {
    /* tables may not exist before migration — non-fatal */
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
    const raw = await callModel(
      settings.OPENROUTER_API_KEY,
      model,
      briefSystem(settings),
      `Today: ${new Date().toUTCString()}\n\nDIGEST:\n${digest}`,
    );
    const parsed = extractJson(raw);

    const brief: Brief = {
      ...base,
      model,
      headline: String(parsed.headline ?? '').slice(0, 140),
      summary: String(parsed.summary ?? ''),
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 6) : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 4) : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies.slice(0, 3) : [],
    };

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
  const { results } = await db.prepare('SELECT title FROM tasks WHERE done = 0').all<{ title: string }>();
  const existing = new Set((results ?? []).map((r) => r.title.toLowerCase()));
  for (const p of brief.priorities) {
    if (existing.has(p.title.toLowerCase())) continue;
    await createTask(db, p.title, p.context || p.source_ref);
  }
  if (brief.headline) {
    await logMemory(db, `Brief: ${brief.headline}`, 'ATLAS', 'one-shot brief');
  }
  await logAgentRun(db, 'CONDUCTOR', 'one_shot_brief', `${brief.priorities.length} priorities, ${brief.replies.length} drafts, ${brief.needs_attention} flagged`);
}
