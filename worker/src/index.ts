import { Hono } from 'hono';
import type { Env } from './types';
import { orchestrate } from './orchestrator';
import { listTasks, toggleTask, createTask } from './db';
import { recentMemories } from './db';
import { runBrief } from './brief';
import { buildGraph } from './graph';
import { loadSettings, saveSettings, settingsStatus } from './settings';
import { listLoops, setLoopStatus } from './loops';
import { listDocs, getDoc, saveDoc, deleteDoc } from './docs';
import { buildPane } from './panes';
import { usageSummary } from './usage';
import { logMemory, logDecision } from './db';
import { deferTask, triageByRef, triageCounts, triageItem, triageOverlay, undeferTask, wakeDeferred, wakeDeferredTasks } from './triage';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ service: 'solent-conductor', status: 'ok' }));

// ---- ONE-SHOT EXECUTIVE PASS -------------------------------------------
// Pulls Pumble + Gmail + Zoho in parallel, makes exactly ONE LLM call,
// persists priorities, and caches the result (default 30 min TTL).
app.post('/api/brief', async (c) => {
  const force = c.req.query('force') === '1';
  const brief = await runBrief(c.env, { force });
  return c.json(brief);
});

app.get('/api/brief', async (c) => {
  // Read path never spends credits unless the cache is cold AND sources have items.
  const brief = await runBrief(c.env, { force: false });
  return c.json(brief);
});

// ---- ATTENTION QUEUE ------------------------------------------------------
// Durable "needs you" items — zero-credit reads from the identity layer.
app.get('/api/attention', async (c) => {
  try {
    await wakeDeferred(c.env.DB); // deferred items whose time has come re-surface
    const { results } = await c.env.DB
      .prepare("SELECT id, source, channel, from_name, title, text, ts, is_dm, mentions_me, attention_reason FROM items WHERE needs_attention = 1 AND triage_status = 'open' ORDER BY created_at DESC LIMIT 30")
      .all();
    return c.json({ items: results ?? [] });
  } catch {
    return c.json({ items: [] });
  }
});

app.post('/api/attention/:id/seen', async (c) => {
  const id = Number(c.req.param('id'));
  await triageItem(c.env.DB, id, 'sorted');
  return c.json({ ok: true });
});

// ---- UNIVERSAL TRIAGE ------------------------------------------------------
// Every prompt/message/notice can be marked sorted (dealt with) or deferred
// (snoozed) — one state, reflected system-wide. Zero-credit.
app.post('/api/triage/item/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ action?: string; defer?: string }>().catch(() => ({} as any));
  const action = body.action === 'sorted' || body.action === 'deferred' || body.action === 'reopen' ? body.action : null;
  if (!action) return c.json({ error: 'action must be sorted|deferred|reopen' }, 400);
  await triageItem(c.env.DB, id, action, body.defer);
  return c.json({ ok: true, id, action });
});

// Triage by (source, ref) — for brief-inbox rows that only carry a ref.
app.post('/api/triage/ref', async (c) => {
  const body = await c.req.json<{ source?: string; ref?: string; action?: string; defer?: string }>().catch(() => ({} as any));
  const action = body.action === 'sorted' || body.action === 'deferred' || body.action === 'reopen' ? body.action : null;
  if (!body.source || !body.ref || !action) return c.json({ error: 'source, ref, action required' }, 400);
  const id = await triageByRef(c.env.DB, body.source, body.ref, action, body.defer);
  return c.json({ ok: true, id, action });
});

// Overlay: source:ref -> triage state, so the UI can hide sorted/deferred
// rows that came from the (cached) brief inbox.
app.get('/api/triage/overlay', async (c) => {
  await wakeDeferred(c.env.DB);
  const [overlay, counts] = await Promise.all([triageOverlay(c.env.DB), triageCounts(c.env.DB)]);
  return c.json({ overlay, counts });
});

// Deferred shelf: everything snoozed, with when it comes back.
app.get('/api/triage/deferred', async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare("SELECT id, source, channel, from_name, title, text, attention_reason, deferred_until, triaged_at FROM items WHERE triage_status = 'deferred' ORDER BY COALESCE(deferred_until, 9e15) ASC LIMIT 50")
      .all();
    return c.json({ items: results ?? [] });
  } catch {
    return c.json({ items: [] });
  }
});

app.post('/api/tasks/:id/defer', async (c) => {
  const body = await c.req.json<{ defer?: string }>().catch(() => ({} as any));
  await deferTask(c.env.DB, Number(c.req.param('id')), body.defer ?? 'tomorrow');
  return c.json({ ok: true });
});

app.post('/api/tasks/:id/undefer', async (c) => {
  await undeferTask(c.env.DB, Number(c.req.param('id')));
  return c.json({ ok: true });
});

// ---- ITEM CONTEXT ---------------------------------------------------------
// Everything the system knows about ONE item: the message, the person behind
// it, their recent history with you, and why it was flagged. Zero-credit.
app.get('/api/items/:id/context', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const item = await c.env.DB
      .prepare('SELECT * FROM items WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>();
    if (!item) return c.json({ error: 'not found' }, 404);

    const fromId = item.from_id as string | null;
    const fromName = item.from_name as string;

    const [person, history, loops] = await Promise.all([
      fromId
        ? c.env.DB.prepare('SELECT name, email, title, vip, last_seen FROM people WHERE source = ? AND ext_id = ?').bind(item.source, fromId).first()
        : Promise.resolve(null),
      c.env.DB
        .prepare('SELECT id, channel, text, ts, is_dm, mentions_me, needs_attention, attention_reason FROM items WHERE from_name = ? AND id != ? ORDER BY created_at DESC LIMIT 8')
        .bind(fromName, id)
        .all()
        .then((r) => r.results ?? []),
      c.env.DB
        .prepare("SELECT id, direction, ask, opened_ts, status FROM loops WHERE counterparty = ? AND status = 'open' LIMIT 5")
        .bind(fromName)
        .all()
        .then((r) => r.results ?? [])
        .catch(() => []),
    ]);

    return c.json({ item, person, history, loops });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Resolve an inbox item ref (source+ref from the brief) to its durable row id.
app.get('/api/items/resolve', async (c) => {
  const source = c.req.query('source');
  const ref = c.req.query('ref');
  if (!source || !ref) return c.json({ error: 'source and ref required' }, 400);
  const row = await c.env.DB.prepare('SELECT id FROM items WHERE source = ? AND ref = ?').bind(source, ref).first<{ id: number }>();
  return c.json({ id: row?.id ?? null });
});

// ---- OPEN LOOPS -----------------------------------------------------------
// Commitments in flight: what you owe people, what you're waiting on.
app.get('/api/loops', async (c) => {
  try {
    return c.json({ loops: await listLoops(c.env.DB) });
  } catch {
    return c.json({ loops: [] });
  }
});

app.post('/api/loops/:id/:action', async (c) => {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action !== 'resolve' && action !== 'dismiss') return c.json({ error: 'action must be resolve|dismiss' }, 400);
  await setLoopStatus(c.env.DB, id, action === 'resolve' ? 'resolved' : 'dismissed');
  return c.json({ ok: true });
});

// ---- CONTEXT LIBRARY (docs) -----------------------------------------------
// Operator-fed ground truth: pasted docs, memos, notes. Injected into prompts.
app.get('/api/docs', async (c) => {
  try {
    return c.json({ docs: await listDocs(c.env.DB) });
  } catch {
    return c.json({ docs: [] });
  }
});

app.get('/api/docs/:id', async (c) => {
  const doc = await getDoc(c.env.DB, Number(c.req.param('id')));
  if (!doc) return c.json({ error: 'not found' }, 404);
  return c.json(doc);
});

app.post('/api/docs', async (c) => {
  let body: { id?: number; title?: string; content?: string; kind?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  if (!body.title?.trim() || !body.content?.trim()) return c.json({ error: 'title and content required' }, 400);
  const id = await saveDoc(c.env.DB, body.title.trim(), body.content, body.kind ?? 'doc', body.id);
  return c.json({ id }, body.id ? 200 : 201);
});

app.delete('/api/docs/:id', async (c) => {
  await deleteDoc(c.env.DB, Number(c.req.param('id')));
  return c.json({ ok: true });
});

// ---- MODEL PRESETS ----------------------------------------------------------
// Curated frontier-level options at sane prices; the UI renders these as a picker.
app.get('/api/models', (c) =>
  c.json({
    models: [
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3', vendor: 'Moonshot', tier: 'frontier reasoning', price: '$3/$15 per M', note: 'SOTA open-weight 2.8T reasoning model — best orchestrator', reasoning: true },
      { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', vendor: 'Moonshot', tier: 'cheap frontier', price: '~$0.6/$2.5 per M', note: 'Kimi line workhorse — near-frontier at low cost', reasoning: false },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', vendor: 'Anthropic', tier: 'frontier', price: '$3/$15 per M', note: 'Excellent judgement + strict JSON; strong tool use', reasoning: false },
      { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', vendor: 'DeepSeek', tier: 'near-frontier cheap', price: '~$0.3/$1.2 per M', note: 'Frontier-class quality at commodity price', reasoning: false },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', vendor: 'DeepSeek', tier: 'cheap reasoning', price: '~$0.5/$2 per M', note: 'Deliberate reasoning traces, very cheap', reasoning: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', vendor: 'Google', tier: 'fast + cheap', price: '~$0.15/$0.6 per M', note: 'Fastest triage; fine for briefs', reasoning: false },
      { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B', vendor: 'Alibaba', tier: 'open frontier', price: '~$0.2/$0.6 per M', note: 'Hybrid reasoning modes, strong multilingual', reasoning: true },
    ],
  }),
);

// ---- AGENT PANES ----------------------------------------------------------
// Every council member is a real feature surface: one endpoint returns the
// agent's live data (from D1, zero credits) + which actions the UI exposes.
app.get('/api/agents/:id/pane', async (c) => {
  const id = c.req.param('id').toUpperCase();
  const settings = await loadSettings(c.env.DB, c.env);
  try {
    return c.json(await buildPane(c.env.DB, id, settings));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- USAGE / CREDITS -------------------------------------------------------
// Local spend ledger (every model call) + live OpenRouter account credit.
app.get('/api/usage', async (c) => {
  const settings = await loadSettings(c.env.DB, c.env);
  return c.json(await usageSummary(c.env.DB, settings.OPENROUTER_API_KEY));
});

// ---- PANE ACTIONS -----------------------------------------------------------
app.post('/api/people/:id/vip', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE people SET vip = CASE WHEN vip = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(id).run();
  const row = await c.env.DB.prepare('SELECT vip FROM people WHERE id = ?').bind(id).first<{ vip: number }>();
  return c.json({ ok: true, vip: !!row?.vip });
});

app.post('/api/memories', async (c) => {
  const body = await c.req.json<{ content?: string; agent?: string; source?: string }>().catch(() => ({} as any));
  if (!body.content?.trim()) return c.json({ error: 'content required' }, 400);
  await logMemory(c.env.DB, body.content.trim(), body.agent || 'SCRIBE', body.source);
  return c.json({ ok: true }, 201);
});

app.post('/api/decisions', async (c) => {
  const body = await c.req.json<{ title?: string; rationale?: string; agent?: string }>().catch(() => ({} as any));
  if (!body.title?.trim()) return c.json({ error: 'title required' }, 400);
  await logDecision(c.env.DB, body.title.trim(), body.rationale?.trim() || '', body.agent || 'JUDGE');
  return c.json({ ok: true }, 201);
});

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---- KNOWLEDGE GRAPH ----------------------------------------------------
// Relationship tree over everything the system knows. Pure D1 reads — free.
app.get('/api/graph', async (c) => {
  const graph = await buildGraph(c.env.DB);
  return c.json(graph);
});

// ---- SETTINGS / SOURCES -------------------------------------------------
app.get('/api/settings', async (c) => {
  const s = await loadSettings(c.env.DB, c.env);
  return c.json(settingsStatus(s));
});

app.post('/api/settings', async (c) => {
  let body: Record<string, string>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  await saveSettings(c.env.DB, body);
  const s = await loadSettings(c.env.DB, c.env);
  return c.json(settingsStatus(s));
});

// Lightweight health/state snapshot the UI can poll.
app.get('/api/state', async (c) => {
  const db = c.env.DB;
  await wakeDeferredTasks(db);
  const tasks = await listTasks(db);
  const memories = await recentMemories(db, 5);
  return c.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      context: t.context,
      time: t.time,
      done: !!t.done,
      priority: !!t.priority,
    })),
    memories: memories.map((m) => ({ id: m.id, content: m.content, agent: m.agent })),
    hasKey: !!c.env.OPENROUTER_API_KEY,
  });
});

app.post('/api/tasks', async (c) => {
  const body = await c.req.json<{ title: string; context?: string }>();
  if (!body.title) return c.json({ error: 'title required' }, 400);
  const task = await createTask(c.env.DB, body.title, body.context);
  return c.json(task, 201);
});

app.post('/api/tasks/:id/toggle', async (c) => {
  const id = Number(c.req.param('id'));
  const task = await toggleTask(c.env.DB, id);
  if (!task) return c.json({ error: 'not found' }, 404);
  return c.json(task);
});

// Council chat. Expects { messages: ChatMessage[], agent?: string }. Streams SSE.
// When `agent` names a specialist (ATLAS, HERMES…) the reply comes from that
// agent in its own voice — with full access to the shared tools.
app.post('/api/chat', async (c) => {
  let body: { messages?: any[]; agent?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return c.json({ error: 'messages required' }, 400);

  const result = await orchestrate(c.env, messages, body.agent?.toUpperCase());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      for (const tr of result.toolResults) send('tool', tr);
      send('reply', { content: result.reply, agent: body.agent?.toUpperCase() || 'CONDUCTOR' });
      send('done', { ok: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// Anything that isn't /api/* falls through to the built SPA assets.
app.all('*', (c) => {
  const assets = (c.env as unknown as { ASSETS?: { fetch: (r: Request) => Promise<Response> } }).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.json({ service: 'solent-conductor', status: 'ok' });
});

export default {
  fetch: app.fetch,
  // Morning auto-brief: the day is triaged before the app is even opened.
  // Configure with [triggers] crons in wrangler.toml. force=true refreshes the cache.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBrief(env, { force: true }));
  },
};
