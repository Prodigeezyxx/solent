import type { D1Database } from '@cloudflare/workers-types';
import type { Settings } from './settings';
import { usageSummary } from './usage';

/**
 * Agent panes — every council member is a real feature surface, not a persona.
 * One endpoint (`GET /api/agents/:id/pane`) returns a tailored, zero-LLM
 * payload assembled from D1: the agent's live data, stats, and the actions
 * the UI should expose. All reads are free; the model is only involved when
 * the operator explicitly chats with the agent.
 */

export interface PaneStat {
  label: string;
  value: string;
  hint?: string;
}

export interface PaneItem {
  id: number | string;
  title: string;
  detail?: string;
  meta?: string;
  flag?: boolean;
  done?: boolean;
  ts?: number;
}

export interface PaneSection {
  key: string;
  title: string;
  kind: 'tasks' | 'list' | 'people' | 'drafts' | 'usage' | 'docs' | 'loops';
  items: PaneItem[];
  empty?: string;
}

export interface AgentPane {
  agent: string;
  headline: string;
  stats: PaneStat[];
  sections: PaneSection[];
  actions: string[]; // action verbs the UI renders as buttons / forms
  chat_hint: string; // placeholder for the agent-directed chat box
}

const day = 86_400_000;
const ago = (ts: number) => {
  const d = Math.floor((Date.now() - ts) / day);
  return d <= 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function cachedBrief(db: D1Database): Promise<any | null> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = '_brief_cache'").first<{ value: string }>();
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

export async function buildPane(db: D1Database, agentId: string, settings: Settings): Promise<AgentPane> {
  switch (agentId) {
    case 'ATLAS': return atlasPane(db);
    case 'SCRIBE': return scribePane(db);
    case 'ORACLE': return oraclePane(db);
    case 'HERMES': return hermesPane(db);
    case 'HUNTER': return hunterPane(db);
    case 'MUSE': return musePane(db);
    case 'VAULT': return vaultPane(db);
    case 'FORGE': return forgePane(db);
    case 'LEDGER': return ledgerPane(db, settings);
    case 'CIRCLE': return circlePane(db);
    case 'JUDGE': return judgePane(db);
    case 'GHOST': return ghostPane(db, settings);
    default: return atlasPane(db);
  }
}

// ---- ATLAS · Chief of Staff: the day's plan --------------------------------
async function atlasPane(db: D1Database): Promise<AgentPane> {
  const [tasksQ, loopsQ, brief] = await Promise.all([
    db.prepare('SELECT id, title, context, done, priority, created_at FROM tasks ORDER BY done ASC, priority DESC, created_at DESC LIMIT 25').all(),
    db.prepare("SELECT id, direction, counterparty, ask, created_at FROM loops WHERE status='open' ORDER BY created_at ASC LIMIT 10").all().catch(() => ({ results: [] as any[] })),
    cachedBrief(db),
  ]);
  const tasks = (tasksQ.results ?? []) as any[];
  const loops = (loopsQ.results ?? []) as any[];
  const open = tasks.filter((t) => !t.done);
  const doneToday = tasks.filter((t) => t.done && Date.now() - t.created_at < day).length;
  return {
    agent: 'ATLAS',
    headline: brief?.headline || 'Run the brief to build today’s plan.',
    stats: [
      { label: 'Open tasks', value: String(open.length) },
      { label: 'Done today', value: String(doneToday) },
      { label: 'Open loops', value: String(loops.length), hint: 'commitments in flight' },
    ],
    sections: [
      {
        key: 'queue', title: 'Priority queue', kind: 'tasks',
        items: tasks.map((t) => ({ id: t.id, title: t.title, detail: t.context ?? undefined, done: !!t.done, flag: !!t.priority, ts: t.created_at, meta: ago(t.created_at) })),
        empty: 'No tasks yet. Add one below or run the brief.',
      },
      {
        key: 'loops', title: 'Oldest open loops', kind: 'loops',
        items: loops.map((l) => ({ id: l.id, title: `${l.direction === 'inbound' ? 'You owe' : 'Waiting on'} ${l.counterparty}`, detail: clip(l.ask, 100), meta: ago(l.created_at), flag: Date.now() - l.created_at > 2 * day })),
        empty: 'No open commitments — clean slate.',
      },
    ],
    actions: ['add_task'],
    chat_hint: 'Ask ATLAS to plan your day, sequence priorities, or re-order the queue…',
  };
}

// ---- SCRIBE · External memory ----------------------------------------------
async function scribePane(db: D1Database): Promise<AgentPane> {
  const { results } = await db.prepare('SELECT id, content, agent, source, created_at FROM memories ORDER BY created_at DESC LIMIT 30').all();
  const memories = (results ?? []) as any[];
  const week = memories.filter((m) => Date.now() - m.created_at < 7 * day).length;
  return {
    agent: 'SCRIBE',
    headline: memories.length ? `${memories.length} durable memories on record.` : 'Nothing captured yet — every insight you log compounds.',
    stats: [
      { label: 'Memories', value: String(memories.length) },
      { label: 'This week', value: String(week) },
    ],
    sections: [{
      key: 'memories', title: 'Memory log', kind: 'list',
      items: memories.map((m) => ({ id: m.id, title: clip(m.content, 120), meta: `${m.agent}${m.source ? ` · ${m.source}` : ''} · ${ago(m.created_at)}` })),
      empty: 'Log your first insight below.',
    }],
    actions: ['add_memory'],
    chat_hint: 'Paste notes or tell SCRIBE what to remember — it distills and stores the essence…',
  };
}

// ---- ORACLE · Signal radar ---------------------------------------------------
async function oraclePane(db: D1Database): Promise<AgentPane> {
  const brief = await cachedBrief(db);
  const signals = (brief?.signals ?? []) as any[];
  const bySource = await db.prepare("SELECT source, COUNT(*) c, SUM(needs_attention) a FROM items WHERE created_at >= ? GROUP BY source").bind(Date.now() - 2 * day).all().catch(() => ({ results: [] as any[] }));
  const src = (bySource.results ?? []) as any[];
  return {
    agent: 'ORACLE',
    headline: signals[0]?.title || 'No distilled signals yet — run the brief.',
    stats: src.map((s) => ({ label: s.source, value: String(s.c), hint: `${s.a ?? 0} flagged` })),
    sections: [{
      key: 'signals', title: 'Signals from the last pass', kind: 'list',
      items: signals.map((s, i) => ({ id: i, title: s.title, detail: s.meta, meta: `${s.label} · confidence ${s.score}` })),
      empty: 'Signals are patterns worth knowing — they appear after each pass.',
    }],
    actions: [],
    chat_hint: 'Ask ORACLE what patterns it sees across your sources, market moves, or a specific trend…',
  };
}

// ---- HERMES · Comms ----------------------------------------------------------
async function hermesPane(db: D1Database): Promise<AgentPane> {
  const brief = await cachedBrief(db);
  const replies = (brief?.replies ?? []) as any[];
  const { results } = await db
    .prepare('SELECT id, source, channel, from_name, text, attention_reason, created_at FROM items WHERE needs_attention = 1 AND seen = 0 ORDER BY created_at DESC LIMIT 12')
    .all();
  const waiting = (results ?? []) as any[];
  return {
    agent: 'HERMES',
    headline: replies.length ? `${replies.length} drafts ready · ${waiting.length} messages await you.` : `${waiting.length} messages await a reply.`,
    stats: [
      { label: 'Drafts ready', value: String(replies.length) },
      { label: 'Awaiting you', value: String(waiting.length) },
    ],
    sections: [
      {
        key: 'drafts', title: 'Drafted replies (approve & send)', kind: 'drafts',
        items: replies.map((r, i) => ({ id: i, title: `to ${r.to} · ${r.channel}`, detail: r.draft, meta: `re: ${clip(r.re, 60)}` })),
        empty: 'Drafts land here when a pass finds messages waiting on you.',
      },
      {
        key: 'waiting', title: 'Messages that need a reply', kind: 'list',
        items: waiting.map((w) => ({ id: w.id, title: `${w.from_name} · ${w.channel ?? w.source}`, detail: clip(w.text, 110), meta: w.attention_reason ?? '', flag: true })),
        empty: 'Inbox zero on human messages.',
      },
    ],
    actions: [],
    chat_hint: 'Ask HERMES to draft an email, DM, or outreach in your voice — give it the person and the goal…',
  };
}

// ---- HUNTER · GTM radar --------------------------------------------------------
async function hunterPane(db: D1Database): Promise<AgentPane> {
  const brief = await cachedBrief(db);
  const gtmSignals = ((brief?.signals ?? []) as any[]).filter((s) => /market|network/i.test(s.label ?? ''));
  const { results } = await db
    .prepare("SELECT name, email, title, source, last_seen FROM people WHERE source != 'pumble' ORDER BY last_seen DESC LIMIT 15")
    .all();
  const external = (results ?? []) as any[];
  return {
    agent: 'HUNTER',
    headline: gtmSignals[0]?.title || 'Warm paths and growth vectors surface here.',
    stats: [
      { label: 'External contacts', value: String(external.length), hint: 'seen recently' },
      { label: 'GTM signals', value: String(gtmSignals.length) },
    ],
    sections: [
      {
        key: 'gtm', title: 'Market & network signals', kind: 'list',
        items: gtmSignals.map((s, i) => ({ id: i, title: s.title, detail: s.meta, meta: `${s.label} · ${s.score}` })),
        empty: 'Market/Network signals from passes appear here.',
      },
      {
        key: 'external', title: 'External people in your orbit', kind: 'people',
        items: external.map((p, i) => ({ id: i, title: p.name, detail: p.email ?? undefined, meta: `${p.source} · ${ago(p.last_seen)}` })),
        empty: 'External contacts appear as email flows in.',
      },
    ],
    actions: [],
    chat_hint: 'Ask HUNTER for warm paths to a company, partnership angles, or who in your orbit can intro you…',
  };
}

// ---- MUSE · Content engine ------------------------------------------------------
async function musePane(db: D1Database): Promise<AgentPane> {
  const { results } = await db.prepare("SELECT id, content, created_at FROM memories WHERE agent = 'MUSE' ORDER BY created_at DESC LIMIT 15").all();
  const drafts = (results ?? []) as any[];
  const brief = await cachedBrief(db);
  return {
    agent: 'MUSE',
    headline: brief?.headline ? `Today’s raw material: “${clip(brief.headline, 70)}”` : 'Turn what happened today into content.',
    stats: [{ label: 'Content pieces', value: String(drafts.length) }],
    sections: [{
      key: 'content', title: 'Content bank (drafts by MUSE)', kind: 'list',
      items: drafts.map((d) => ({ id: d.id, title: clip(d.content, 130), meta: ago(d.created_at) })),
      empty: 'Ask MUSE for a post below — accepted drafts are saved here.',
    }],
    actions: [],
    chat_hint: 'Ask MUSE for a LinkedIn post, a thread, or a launch narrative — give it the angle…',
  };
}

// ---- VAULT · Knowledge base --------------------------------------------------------
async function vaultPane(db: D1Database): Promise<AgentPane> {
  const { results } = await db.prepare('SELECT id, title, kind, LENGTH(content) size, updated_at FROM docs ORDER BY updated_at DESC LIMIT 25').all().catch(() => ({ results: [] as any[] }));
  const docs = (results ?? []) as any[];
  const totalKb = Math.round(docs.reduce((a, d) => a + (d.size ?? 0), 0) / 1024);
  return {
    agent: 'VAULT',
    headline: docs.length ? `${docs.length} documents in the context library — injected into every brief as ground truth.` : 'The context library is empty. Feed it and every brief gets smarter.',
    stats: [
      { label: 'Documents', value: String(docs.length) },
      { label: 'Library size', value: `${totalKb} KB` },
    ],
    sections: [{
      key: 'docs', title: 'Context library', kind: 'docs',
      items: docs.map((d) => ({ id: d.id, title: d.title, meta: `${d.kind} · ${Math.round((d.size ?? 0) / 100) / 10} KB · ${ago(d.updated_at)}` })),
      empty: 'Add a doc below, or paste one to CONDUCTOR in chat.',
    }],
    actions: ['add_doc'],
    chat_hint: 'Ask VAULT what it knows about a topic, or paste a document to store…',
  };
}

// ---- FORGE · Product partner ----------------------------------------------------------
async function forgePane(db: D1Database): Promise<AgentPane> {
  const [tasksQ, decQ] = await Promise.all([
    db.prepare("SELECT id, title, context, done, created_at FROM tasks WHERE done = 0 AND (context LIKE '%product%' OR context LIKE '%build%' OR context LIKE '%deploy%' OR title LIKE '%deploy%' OR title LIKE '%build%' OR title LIKE '%ship%') ORDER BY created_at DESC LIMIT 12").all(),
    db.prepare("SELECT id, title, rationale, created_at FROM decisions ORDER BY created_at DESC LIMIT 8").all(),
  ]);
  const buildTasks = (tasksQ.results ?? []) as any[];
  const decisions = (decQ.results ?? []) as any[];
  return {
    agent: 'FORGE',
    headline: buildTasks[0]?.title ? `Top of the build queue: ${clip(buildTasks[0].title, 70)}` : 'No build work queued.',
    stats: [
      { label: 'Build tasks', value: String(buildTasks.length) },
      { label: 'Product decisions', value: String(decisions.length) },
    ],
    sections: [
      {
        key: 'build', title: 'Build queue', kind: 'tasks',
        items: buildTasks.map((t) => ({ id: t.id, title: t.title, detail: t.context ?? undefined, done: !!t.done, meta: ago(t.created_at) })),
        empty: 'Product/build tasks are auto-detected from the queue.',
      },
      {
        key: 'decisions', title: 'Recent technical decisions', kind: 'list',
        items: decisions.map((d) => ({ id: d.id, title: d.title, detail: d.rationale ?? undefined, meta: ago(d.created_at) })),
        empty: 'Decisions logged by JUDGE show here when product-related.',
      },
    ],
    actions: ['add_task'],
    chat_hint: 'Ask FORGE to scope a feature, weigh a trade-off, or find the cheapest path to learning…',
  };
}

// ---- LEDGER · Metrics & spend ----------------------------------------------------------
async function ledgerPane(db: D1Database, settings: Settings): Promise<AgentPane> {
  const usage = await usageSummary(db, settings.OPENROUTER_API_KEY);
  const [itemsQ, tasksQ] = await Promise.all([
    db.prepare('SELECT COUNT(*) c FROM items WHERE created_at >= ?').bind(Date.now() - 7 * day).first<{ c: number }>(),
    db.prepare('SELECT SUM(done) d, COUNT(*) c FROM tasks').first<{ d: number; c: number }>(),
  ]);
  const fmt = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
  const stats: PaneStat[] = [
    { label: 'Spend today', value: fmt(usage.today.cost), hint: `${usage.today.calls} calls` },
    { label: 'Spend 7d', value: fmt(usage.week.cost), hint: `${(usage.week.tokens / 1000).toFixed(1)}k tokens` },
  ];
  if (usage.credits) stats.push({ label: 'OpenRouter credit left', value: fmt(usage.credits.remaining), hint: `of ${fmt(usage.credits.total_credits)} bought` });
  stats.push({ label: 'Items scanned 7d', value: String(itemsQ?.c ?? 0) });
  stats.push({ label: 'Tasks done', value: `${tasksQ?.d ?? 0}/${tasksQ?.c ?? 0}` });
  return {
    agent: 'LEDGER',
    headline: usage.credits
      ? `${fmt(usage.credits.remaining)} of OpenRouter credit remaining · ${fmt(usage.week.cost)} spent by SOLENT this week.`
      : `SOLENT spent ${fmt(usage.week.cost)} across ${usage.week.calls} model calls this week.`,
    stats,
    sections: [
      {
        key: 'by_model', title: 'Spend by model', kind: 'usage',
        items: usage.by_model.map((m, i) => ({ id: i, title: m.model, meta: `${m.calls} calls · ${(m.tokens / 1000).toFixed(1)}k tok`, detail: fmt(m.cost) })),
        empty: 'Model calls will be accounted here.',
      },
      {
        key: 'by_purpose', title: 'Spend by purpose', kind: 'usage',
        items: usage.by_purpose.map((p, i) => ({ id: i, title: p.purpose, meta: `${p.calls} calls`, detail: fmt(p.cost) })),
        empty: '',
      },
      {
        key: 'recent', title: 'Recent calls', kind: 'usage',
        items: usage.recent.map((r, i) => ({ id: i, title: `${r.purpose} · ${r.model.split('/').pop()}`, meta: `${r.total_tokens} tok · ${ago(r.created_at)}`, detail: fmt(r.cost) })),
        empty: '',
      },
    ],
    actions: [],
    chat_hint: 'Ask LEDGER what moved this week, cost per brief, or whether to switch models to save credit…',
  };
}

// ---- CIRCLE · Network CRM --------------------------------------------------------------
async function circlePane(db: D1Database): Promise<AgentPane> {
  const { results } = await db
    .prepare(`SELECT p.id, p.name, p.email, p.title, p.vip, p.source, p.last_seen,
      (SELECT COUNT(*) FROM items i WHERE i.from_name = p.name) msg_count
      FROM people p ORDER BY p.vip DESC, p.last_seen DESC LIMIT 40`)
    .all();
  const people = (results ?? []) as any[];
  const vips = people.filter((p) => p.vip);
  const stale = people.filter((p) => Date.now() - p.last_seen > 7 * day);
  return {
    agent: 'CIRCLE',
    headline: `${people.length} people in your orbit · ${vips.length} VIPs · ${stale.length} going quiet.`,
    stats: [
      { label: 'People', value: String(people.length) },
      { label: 'VIPs', value: String(vips.length) },
      { label: 'Quiet > 7d', value: String(stale.length) },
    ],
    sections: [{
      key: 'people', title: 'Relationship radar (★ = VIP — click to toggle)', kind: 'people',
      items: people.map((p) => ({
        id: p.id,
        title: p.name,
        detail: [p.title, p.email].filter(Boolean).join(' · ') || undefined,
        meta: `${p.source} · ${p.msg_count} msgs · ${ago(p.last_seen)}`,
        flag: !!p.vip,
      })),
      empty: 'People appear as messages flow in from your sources.',
    }],
    actions: ['toggle_vip'],
    chat_hint: 'Ask CIRCLE who you owe a reply, who is going quiet, or the history with a specific person…',
  };
}

// ---- JUDGE · Decision journal --------------------------------------------------------------
async function judgePane(db: D1Database): Promise<AgentPane> {
  const { results } = await db.prepare('SELECT id, title, rationale, agent, created_at FROM decisions ORDER BY created_at DESC LIMIT 25').all();
  const decisions = (results ?? []) as any[];
  return {
    agent: 'JUDGE',
    headline: decisions.length ? `${decisions.length} decisions on record. Every bet has a rationale.` : 'No decisions logged yet. Decisions without rationale are just moods.',
    stats: [
      { label: 'Decisions', value: String(decisions.length) },
      { label: 'This month', value: String(decisions.filter((d) => Date.now() - d.created_at < 30 * day).length) },
    ],
    sections: [{
      key: 'journal', title: 'Decision journal', kind: 'list',
      items: decisions.map((d) => ({ id: d.id, title: d.title, detail: d.rationale ?? undefined, meta: ago(d.created_at) })),
      empty: 'Log your first decision below.',
    }],
    actions: ['add_decision'],
    chat_hint: 'Tell JUDGE a decision you’re weighing — it will pressure-test the bet and log the outcome…',
  };
}

// ---- GHOST · Personal layer ------------------------------------------------------------------
async function ghostPane(db: D1Database, settings: Settings): Promise<AgentPane> {
  const { results } = await db.prepare("SELECT id, content, created_at FROM memories WHERE agent = 'GHOST' ORDER BY created_at DESC LIMIT 15").all();
  const notes = (results ?? []) as any[];
  return {
    agent: 'GHOST',
    headline: settings.OPERATOR_NAME ? `Operating profile: ${settings.OPERATOR_NAME}.` : 'Set your operator profile so every agent knows who it works for.',
    stats: [
      { label: 'Identity', value: settings.OPERATOR_NAME || 'not set' },
      { label: 'Private notes', value: String(notes.length) },
    ],
    sections: [{
      key: 'notes', title: 'Private notes (never surfaced unprompted)', kind: 'list',
      items: notes.map((n) => ({ id: n.id, title: clip(n.content, 130), meta: ago(n.created_at) })),
      empty: 'Off-record notes live here — only GHOST sees them.',
    }],
    actions: ['add_note', 'edit_profile'],
    chat_hint: 'Off the record: preferences, personal context, things the rest of the council shouldn’t see…',
  };
}
