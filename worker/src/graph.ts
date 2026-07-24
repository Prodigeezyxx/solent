import type { D1Database } from '@cloudflare/workers-types';
import type { Brief } from './brief';

/**
 * Knowledge graph v2 — zero LLM cost.
 * Built from the durable identity layer (people, items) plus brief outputs
 * and D1 logs. Names are always resolved; channels are first-class nodes;
 * items that need attention pulse heavier.
 */

export type NodeType =
  | 'hub'
  | 'source'
  | 'channel'
  | 'person'
  | 'message'
  | 'task'
  | 'signal'
  | 'draft'
  | 'memory'
  | 'decision';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  detail?: string;
  weight: number;
  attention?: boolean;
  /** epoch ms — lets the UI render time-based layouts */
  ts?: number;
  /** grouping key (source name) — lets the UI render lane/orbit layouts */
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'has' | 'sent' | 'in' | 'derived' | 'about' | 'logged';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generated_at: number;
  empty: boolean;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function personKey(name: string): string {
  return `person:${name.toLowerCase().trim()}`;
}

export async function buildGraph(db: D1Database): Promise<Graph> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (n: GraphNode) => {
    const prev = nodes.get(n.id);
    if (prev) {
      prev.weight = Math.max(prev.weight, n.weight);
      prev.attention = prev.attention || n.attention;
      if (!prev.detail && n.detail) prev.detail = n.detail;
    } else nodes.set(n.id, n);
  };
  const addEdge = (from: string, to: string, kind: GraphEdge['kind']) => {
    if (from === to) return;
    if (!edges.some((e) => e.from === from && e.to === to && e.kind === kind)) edges.push({ from, to, kind });
  };

  addNode({ id: 'hub', type: 'hub', label: 'SOLENT', detail: 'Your executive layer', weight: 10 });

  // ---- Brief cache: source health + LLM outputs -------------------------
  let brief: Brief | null = null;
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = '_brief_cache'").first<{ value: string }>();
    if (row) brief = JSON.parse(row.value) as Brief;
  } catch {
    /* no cache yet */
  }

  for (const s of brief?.sources ?? []) {
    if (!s.configured) continue;
    const id = `source:${s.source}`;
    addNode({ id, type: 'source', label: s.source.toUpperCase(), detail: s.ok ? `${s.count} items in last pass` : s.error ?? 'no data', weight: 6 });
    addEdge('hub', id, 'has');
  }

  // ---- Durable items: channels, people, messages -------------------------
  interface ItemRow {
    id: number;
    source: string;
    channel: string | null;
    from_name: string;
    title: string;
    text: string;
    is_dm: number;
    needs_attention: number;
    attention_reason: string | null;
    created_at: number;
  }
  let items: ItemRow[] = [];
  try {
    const { results } = await db
      .prepare("SELECT id, source, channel, from_name, title, text, is_dm, needs_attention, attention_reason, created_at FROM items WHERE seen = 0 AND triage_status = 'open' ORDER BY needs_attention DESC, created_at DESC LIMIT 40")
      .all<ItemRow>();
    items = results ?? [];
  } catch {
    /* pre-migration */
  }

  const personTitles = new Map<string, string>();
  try {
    const { results } = await db.prepare('SELECT name, title FROM people WHERE title IS NOT NULL').all<{ name: string; title: string }>();
    for (const p of results ?? []) personTitles.set(p.name.toLowerCase(), p.title);
  } catch {
    /* pre-migration */
  }

  const refToMsgNode = new Map<number, string>(); // items.id -> node id
  items.forEach((it) => {
    const srcId = `source:${it.source}`;
    if (!nodes.has(srcId)) {
      addNode({ id: srcId, type: 'source', label: it.source.toUpperCase(), weight: 6 });
      addEdge('hub', srcId, 'has');
    }

    // Channel node (skip synthetic DM channels; DMs connect person→message directly)
    let parentId = srcId;
    if (it.channel && !it.is_dm) {
      const chId = `channel:${it.source}:${it.channel.toLowerCase()}`;
      addNode({ id: chId, type: 'channel', label: it.channel, detail: `${it.source} channel`, weight: 4 });
      addEdge(srcId, chId, 'has');
      parentId = chId;
    }

    const pid = personKey(it.from_name);
    const title = personTitles.get(it.from_name.toLowerCase());
    if (!nodes.has(pid)) {
      addNode({ id: pid, type: 'person', label: it.from_name, detail: title ?? undefined, weight: 3, group: it.source });
    } else {
      const p = nodes.get(pid)!;
      p.weight = Math.min(p.weight + 0.5, 6);
    }
    addEdge(parentId, pid, 'has');

    const mid = `item:${it.id}`;
    refToMsgNode.set(it.id, mid);
    addNode({
      id: mid,
      type: 'message',
      label: clip(it.title !== it.channel ? it.title : it.text, 40),
      detail: `${it.channel ?? it.source} · ${clip(it.text, 150)}${it.needs_attention ? ` · ⚑ ${it.attention_reason}` : ''}`,
      weight: it.needs_attention ? 2.6 : 1.5,
      attention: !!it.needs_attention,
      ts: it.created_at,
      group: it.source,
    });
    addEdge(pid, mid, 'sent');
    if (it.is_dm) addEdge(srcId, mid, 'in');
  });

  // ---- Brief outputs: priorities, signals, drafts -------------------------
  const inbox = brief?.inbox ?? [];
  (brief?.priorities ?? []).forEach((p, i) => {
    const id = `brief-task:${i}`;
    addNode({ id, type: 'task', label: clip(p.title, 48), detail: `${p.urgency} · ${p.context}`, weight: p.urgency === 'high' ? 4.5 : 3.5, attention: p.urgency === 'high' });
    // Link back through the digest index → durable item when possible
    const ref = (p.source_ref ?? '').match(/(\d+)/);
    const idx = ref ? Number(ref[1]) - 1 : -1;
    const srcItem = idx >= 0 ? inbox[idx] : undefined;
    if (srcItem) {
      const match = items.find((it) => it.source === srcItem.source && (it.title === srcItem.title || it.text === srcItem.text));
      if (match) {
        addEdge(refToMsgNode.get(match.id)!, id, 'derived');
        return;
      }
      const pid = personKey(srcItem.from);
      if (nodes.has(pid)) {
        addEdge(pid, id, 'derived');
        return;
      }
    }
    addEdge('hub', id, 'derived');
  });

  (brief?.signals ?? []).forEach((s, i) => {
    const id = `signal:${i}`;
    addNode({ id, type: 'signal', label: clip(s.title, 46), detail: `${s.label} · ${s.score}`, weight: 3 });
    addEdge('hub', id, 'derived');
  });

  (brief?.replies ?? []).forEach((r, i) => {
    const id = `draft:${i}`;
    addNode({ id, type: 'draft', label: clip(`re: ${r.re}`, 40), detail: clip(r.draft, 160), weight: 2.5 });
    const pid = personKey(r.to);
    if (nodes.has(pid)) addEdge(id, pid, 'about');
    const sid = `source:${r.channel}`;
    if (nodes.has(sid)) addEdge(sid, id, 'has');
    else if (!nodes.has(pid)) addEdge('hub', id, 'has');
  });

  // ---- D1 logs: open tasks, memories, decisions ---------------------------
  try {
    const { results: tasks } = await db
      .prepare('SELECT id, title, context, done, created_at FROM tasks ORDER BY created_at DESC LIMIT 20')
      .all<{ id: number; title: string; context: string | null; done: number; created_at: number }>();
    for (const t of tasks ?? []) {
      const dup = [...nodes.values()].some((n) => n.type === 'task' && n.label.toLowerCase() === clip(t.title, 48).toLowerCase());
      if (dup) continue;
      const id = `task:${t.id}`;
      const src = (t.context ?? '').match(/\b(pumble|gmail|zoho|gcal)\b/i)?.[1]?.toLowerCase();
      addNode({ id, type: 'task', label: clip(t.title, 48), detail: t.done ? 'done' : t.context ?? 'open', weight: t.done ? 2 : 3.5, ts: t.created_at, group: src ?? undefined });
      addEdge(src && nodes.has(`source:${src}`) ? `source:${src}` : 'hub', id, 'derived');
    }

    const { results: memories } = await db
      .prepare('SELECT id, content, agent, created_at FROM memories ORDER BY created_at DESC LIMIT 10')
      .all<{ id: number; content: string; agent: string; created_at: number }>();
    for (const m of memories ?? []) {
      const id = `memory:${m.id}`;
      addNode({ id, type: 'memory', label: clip(m.content, 46), detail: `logged by ${m.agent}`, weight: 2, ts: m.created_at });
      addEdge('hub', id, 'logged');
    }

    const { results: decisions } = await db
      .prepare('SELECT id, title, rationale, created_at FROM decisions ORDER BY created_at DESC LIMIT 10')
      .all<{ id: number; title: string; rationale: string | null; created_at: number }>();
    for (const d of decisions ?? []) {
      const id = `decision:${d.id}`;
      addNode({ id, type: 'decision', label: clip(d.title, 46), detail: d.rationale ?? undefined, weight: 3, ts: d.created_at });
      addEdge('hub', id, 'logged');
    }
  } catch {
    /* tables may be empty on first boot */
  }

  const nodeList = [...nodes.values()];
  return {
    nodes: nodeList,
    edges,
    generated_at: Date.now(),
    empty: nodeList.length <= 1,
  };
}
