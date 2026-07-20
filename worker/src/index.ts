import { Hono } from 'hono';
import type { Env } from './types';
import { orchestrate } from './orchestrator';
import { listTasks, toggleTask, createTask } from './db';
import { recentMemories } from './db';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ service: 'nexus-conductor', status: 'ok' }));

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

export default app;
