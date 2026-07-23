import type { D1Database } from '@cloudflare/workers-types';
import type { Brief } from './brief';

/**
 * Knowledge graph builder — zero LLM cost.
 * Derives a relationship tree from what the system already knows:
 * sources → people → messages, plus priorities, signals, reply drafts,
 * memories, and decisions from D1. Edges encode provenance
 * ("this task came from that message from that person on that source").
 */

export type NodeType =
  | 'hub'
  | 'source'
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
  weight: number; // relative importance → node size
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

/** Normalise "Jane Doe <jane@x.com>" → "Jane Doe"; bare emails keep the local part. */
function personName(from: string): string {
  const m = from.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (m) return m[1].trim();
  const email = from.match(/^([^@\s]+)@/);
  if (email) return email[1];
  return from.trim() || 'unknown';
}

export async function buildGraph(db: D1Database): Promise<Graph> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (n: GraphNode) => {
    const prev = nodes.get(n.id);
    if (prev) prev.weight = Math.max(prev.weight, n.weight);
    else nodes.set(n.id, n);
  };
  const addEdge = (from: string, to: string, kind: GraphEdge['kind']) => {
    if (from === to) return;
    if (!edges.some((e) => e.from === from && e.to === to && e.kind === kind)) edges.push({ from, to, kind });
  };

  addNode({ id: 'hub', type: 'hub', label: 'NEXUS', detail: 'Your executive layer', weight: 10 });

  // ---- Brief cache: sources, inbox, priorities, signals, drafts ----------
  let brief: Brief | null = null;
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = '_brief_cache'").first<{ value: string }>();
    if (row) brief = JSON.parse(row.value) as Brief;
  } catch {
    /* no cache yet */
  }

  const inbox = brief?.inbox ?? [];
  const personIds = new Map<string, string>();

  for (const s of brief?.sources ?? []) {
    if (!s.configured) continue;
    const id = `source:${s.source}`;
    addNode({ id, type: 'source', label: s.source.toUpperCase(), detail: s.ok ? `${s.count} items in last pass` : s.error ?? 'no data', weight: 6 });
    addEdge('hub', id, 'has');
  }

  // People + messages (cap to keep the canvas readable)
  const msgCap = 30;
  inbox.slice(0, msgCap).forEach((item, idx) => {
    const srcId = `source:${item.source}`;
    if (!nodes.has(srcId)) {
      addNode({ id: srcId, type: 'source', label: item.source.toUpperCase(), weight: 6 });
      addEdge('hub', srcId, 'has');
    }
    const name = personName(item.from);
    const pid = `person:${name.toLowerCase()}`;
    if (!personIds.has(pid)) {
      personIds.set(pid, name);
      addNode({ id: pid, type: 'person', label: name, detail: item.from, weight: 3 });
      addEdge(srcId, pid, 'has');
    } else {
      const p = nodes.get(pid)!;
      p.weight = Math.min(p.weight + 0.5, 6); // frequent senders grow
      addEdge(srcId, pid, 'has');
    }
    const mid = `msg:${idx}`;
    addNode({ id: mid, type: 'message', label: clip(item.title, 40), detail: clip(item.text, 160), weight: 1.6 });
    addEdge(pid, mid, 'sent');
  });

  // Priorities from the brief → link back to their source message when possible.
  // source_ref format is "[source:n]" / "source:n" where n is the 1-based digest index.
  (brief?.priorities ?? []).forEach((p, i) => {
    const id = `brief-task:${i}`;
    addNode({ id, type: 'task', label: clip(p.title, 48), detail: `${p.urgency} · ${p.context}`, weight: p.urgency === 'high' ? 4.5 : 3.5 });
    const ref = (p.source_ref ?? '').match(/(\d+)/);
    const idx = ref ? Number(ref[1]) - 1 : -1;
    if (idx >= 0 && idx < Math.min(inbox.length, msgCap)) addEdge(`msg:${idx}`, id, 'derived');
    else addEdge('hub', id, 'derived');
  });

  (brief?.signals ?? []).forEach((s, i) => {
    const id = `signal:${i}`;
    addNode({ id, type: 'signal', label: clip(s.title, 46), detail: `${s.label} · ${s.score}`, weight: 3 });
    addEdge('hub', id, 'derived');
  });

  (brief?.replies ?? []).forEach((r, i) => {
    const id = `draft:${i}`;
    addNode({ id, type: 'draft', label: clip(`re: ${r.re}`, 40), detail: clip(r.draft, 160), weight: 2.5 });
    const pid = `person:${personName(r.to).toLowerCase()}`;
    if (nodes.has(pid)) addEdge(id, pid, 'about');
    else {
      const sid = `source:${r.channel}`;
      addEdge(nodes.has(sid) ? sid : 'hub', id, 'has');
    }
    if (nodes.has(`source:${r.channel}`)) addEdge(`source:${r.channel}`, id, 'has');
  });

  // ---- D1: open tasks, memories, decisions --------------------------------
  try {
    const { results: tasks } = await db
      .prepare('SELECT id, title, context, done FROM tasks ORDER BY created_at DESC LIMIT 20')
      .all<{ id: number; title: string; context: string | null; done: number }>();
    for (const t of tasks ?? []) {
      // Skip if the same title already exists as a brief priority node
      const dup = [...nodes.values()].some((n) => n.type === 'task' && n.label.toLowerCase() === clip(t.title, 48).toLowerCase());
      if (dup) continue;
      const id = `task:${t.id}`;
      addNode({ id, type: 'task', label: clip(t.title, 48), detail: t.done ? 'done' : t.context ?? 'open', weight: t.done ? 2 : 3.5 });
      const src = (t.context ?? '').match(/\b(pumble|gmail|zoho)\b/i)?.[1]?.toLowerCase();
      addEdge(src && nodes.has(`source:${src}`) ? `source:${src}` : 'hub', id, 'derived');
    }

    const { results: memories } = await db
      .prepare('SELECT id, content, agent FROM memories ORDER BY created_at DESC LIMIT 10')
      .all<{ id: number; content: string; agent: string }>();
    for (const m of memories ?? []) {
      const id = `memory:${m.id}`;
      addNode({ id, type: 'memory', label: clip(m.content, 46), detail: `logged by ${m.agent}`, weight: 2 });
      addEdge('hub', id, 'logged');
    }

    const { results: decisions } = await db
      .prepare('SELECT id, title, rationale FROM decisions ORDER BY created_at DESC LIMIT 10')
      .all<{ id: number; title: string; rationale: string | null }>();
    for (const d of decisions ?? []) {
      const id = `decision:${d.id}`;
      addNode({ id, type: 'decision', label: clip(d.title, 46), detail: d.rationale ?? undefined, weight: 3 });
      addEdge('hub', id, 'logged');
    }
  } catch {
    /* tables may be empty/missing on first boot */
  }

  const nodeList = [...nodes.values()];
  return {
    nodes: nodeList,
    edges,
    generated_at: Date.now(),
    empty: nodeList.length <= 1,
  };
}
