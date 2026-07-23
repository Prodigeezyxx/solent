import { Hono } from 'hono';
import type { Env } from './types';
import { orchestrate } from './orchestrator';
import { listTasks, toggleTask, createTask } from './db';
import { recentMemories } from './db';
import { runBrief } from './brief';
import { buildGraph } from './graph';
import { loadSettings, saveSettings, settingsStatus } from './settings';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ service: 'nexus-conductor', status: 'ok' }));

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

// CONDUCTOR chat. Expects { messages: ChatMessage[] }. Streams SSE.
app.post('/api/chat', async (c) => {
  let body: { messages?: any[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return c.json({ error: 'messages required' }, 400);

  const result = await orchestrate(c.env, messages);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      for (const tr of result.toolResults) send('tool', tr);
      send('reply', { content: result.reply });
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
  return c.json({ service: 'nexus-conductor', status: 'ok' });
});

export default app;
