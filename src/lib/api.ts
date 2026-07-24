import type { Task } from '../types';

export interface ToolEvent {
  agent: string;
  action: string;
  detail: string;
}

export interface ChatPayload {
  role: 'user' | 'assistant' | 'system' | 'agent';
  agent?: string;
  content: string;
}

export interface ChatStreamHandlers {
  onTool?: (tool: ToolEvent) => void;
  onReply: (chunk: { content: string; agent?: string }) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// Streams a council response from the Worker via Server-Sent Events.
// Pass `agent` to talk to a specific specialist (ATLAS, HERMES…) in its own voice.
export async function streamChat(messages: ChatPayload[], handlers: ChatStreamHandlers, agent?: string): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, ...(agent && agent !== 'CONDUCTOR' ? { agent } : {}) }),
    });
    if (!res.ok || !res.body) {
      handlers.onError?.(new Error(`Chat request failed (${res.status})`));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const block of events) {
        const lines = block.split('\n');
        let event = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (!event || !data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === 'tool') handlers.onTool?.(parsed);
          else if (event === 'reply') handlers.onReply(parsed);
          else if (event === 'done') handlers.onDone?.();
        } catch {
          /* ignore malformed */
        }
      }
    }
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err : new Error('Network error'));
  }
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('state failed');
  const json = (await res.json()) as { tasks: Task[]; hasKey: boolean };
  return json.tasks;
}

// ---- One-shot executive brief -------------------------------------------

export interface InboxItem {
  source: 'pumble' | 'gmail' | 'zoho' | 'gcal';
  ref: string;
  channel?: string;
  from: string;
  fromId?: string;
  title: string;
  text: string;
  ts: string;
  isDm?: boolean;
  mentionsMe?: boolean;
  needsAttention?: boolean;
  attentionReason?: string;
}

export interface BriefSourceMeta {
  source: string;
  configured: boolean;
  ok: boolean;
  count: number;
  error?: string;
}

export interface Brief {
  generated_at: number;
  refreshed_at?: number;
  cached: boolean;
  headline: string;
  summary: string;
  priorities: { title: string; context: string; urgency: 'high' | 'medium' | 'low'; source_ref: string }[];
  signals: { label: string; title: string; meta: string; score: string }[];
  replies: { to: string; channel: string; re: string; draft: string }[];
  sources: BriefSourceMeta[];
  inbox: InboxItem[];
  needs_attention?: number;
  model?: string;
  error?: string;
}

/** GET path: serves the cached brief when fresh — zero credits. */
export async function fetchBrief(): Promise<Brief> {
  const res = await fetch('/api/brief');
  if (!res.ok) throw new Error(`brief failed (${res.status})`);
  return (await res.json()) as Brief;
}

/** POST with force: re-pulls all sources and spends exactly one model call. */
export async function runBriefNow(): Promise<Brief> {
  const res = await fetch('/api/brief?force=1', { method: 'POST' });
  if (!res.ok) throw new Error(`brief failed (${res.status})`);
  return (await res.json()) as Brief;
}

// ---- Knowledge graph -------------------------------------------------------

export type GraphNodeType =
  | 'hub' | 'source' | 'channel' | 'person' | 'message' | 'task' | 'signal' | 'draft' | 'memory' | 'decision';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  detail?: string;
  weight: number;
  attention?: boolean;
  ts?: number;
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'has' | 'sent' | 'in' | 'derived' | 'about' | 'logged';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generated_at: number;
  empty: boolean;
}

/** Pure D1 read — zero credits. */
export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch('/api/graph');
  if (!res.ok) throw new Error(`graph failed (${res.status})`);
  return (await res.json()) as GraphData;
}

// ---- Attention queue --------------------------------------------------------

export interface AttentionItem {
  id: number;
  source: string;
  channel: string | null;
  from_name: string;
  title: string;
  text: string;
  ts: string | null;
  is_dm: number;
  mentions_me: number;
  attention_reason: string | null;
}

/** Pure D1 read — zero credits. Unseen items flagged by the attention engine. */
export async function fetchAttention(): Promise<AttentionItem[]> {
  const res = await fetch('/api/attention');
  if (!res.ok) throw new Error(`attention failed (${res.status})`);
  const json = (await res.json()) as { items: AttentionItem[] };
  return json.items;
}

export async function markSeen(id: number): Promise<void> {
  await fetch(`/api/attention/${id}/seen`, { method: 'POST' });
}

// ---- Open loops -------------------------------------------------------------

export interface Loop {
  id: number;
  direction: 'inbound' | 'outbound';
  source: string;
  ref: string;
  channel: string | null;
  counterparty: string;
  counterparty_id: string | null;
  ask: string;
  opened_ts: string | null;
  status: string;
  created_at: number;
}

/** Zero-credit read: commitments in flight (what you owe / what you await). */
export async function fetchLoops(): Promise<Loop[]> {
  const res = await fetch('/api/loops');
  if (!res.ok) throw new Error(`loops failed (${res.status})`);
  const json = (await res.json()) as { loops: Loop[] };
  return json.loops;
}

export async function actOnLoop(id: number, action: 'resolve' | 'dismiss'): Promise<void> {
  await fetch(`/api/loops/${id}/${action}`, { method: 'POST' });
}

// ---- Item context -----------------------------------------------------------

export interface ItemContext {
  item: {
    id: number; source: string; ref: string; channel: string | null; from_name: string;
    from_id: string | null; title: string; text: string; ts: string | null;
    is_dm: number; mentions_me: number; needs_attention: number; attention_reason: string | null; seen: number;
  };
  person: { name: string; email: string | null; title: string | null; vip: number; last_seen: number } | null;
  history: { id: number; channel: string | null; text: string; ts: string | null; is_dm: number; mentions_me: number; needs_attention: number; attention_reason: string | null }[];
  loops: { id: number; direction: string; ask: string; opened_ts: string | null; status: string }[];
}

export async function resolveItemId(source: string, ref: string): Promise<number | null> {
  const res = await fetch(`/api/items/resolve?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(ref)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { id: number | null };
  return json.id;
}

export async function fetchItemContext(id: number): Promise<ItemContext> {
  const res = await fetch(`/api/items/${id}/context`);
  if (!res.ok) throw new Error(`context failed (${res.status})`);
  return (await res.json()) as ItemContext;
}

// ---- Context library (docs) ---------------------------------------------------

export interface DocMeta {
  id: number;
  title: string;
  kind: string;
  preview: string;
  size: number;
  created_at: number;
  updated_at: number;
}

export async function fetchDocs(): Promise<DocMeta[]> {
  const res = await fetch('/api/docs');
  if (!res.ok) throw new Error('docs failed');
  const json = (await res.json()) as { docs: DocMeta[] };
  return json.docs;
}

export async function saveDocRemote(title: string, content: string, id?: number): Promise<number> {
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, content }),
  });
  if (!res.ok) throw new Error('doc save failed');
  const json = (await res.json()) as { id: number };
  return json.id;
}

export async function deleteDocRemote(id: number): Promise<void> {
  await fetch(`/api/docs/${id}`, { method: 'DELETE' });
}

// ---- Model presets ------------------------------------------------------------

export interface ModelPreset {
  id: string;
  name: string;
  vendor: string;
  tier: string;
  price: string;
  note: string;
  reasoning: boolean;
}

export async function fetchModels(): Promise<ModelPreset[]> {
  const res = await fetch('/api/models');
  if (!res.ok) throw new Error('models failed');
  const json = (await res.json()) as { models: ModelPreset[] };
  return json.models;
}

// ---- Settings / sources ---------------------------------------------------

export type SettingsStatus = Record<string, string | boolean>;

export async function fetchSettings(): Promise<SettingsStatus> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error('settings failed');
  return (await res.json()) as SettingsStatus;
}

export async function saveSettingsRemote(patch: Record<string, string>): Promise<SettingsStatus> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('settings save failed');
  return (await res.json()) as SettingsStatus;
}

export async function toggleTaskRemote(id: number): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error('toggle failed');
  const t = (await res.json()) as Task;
  return { ...t, done: !!t.done, priority: !!t.priority };
}

/** Manually add a task to the priority queue. */
export async function createTaskRemote(title: string, context?: string): Promise<Task> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, context }),
  });
  if (!res.ok) throw new Error('create task failed');
  const t = (await res.json()) as Task;
  return { ...t, done: !!t.done, priority: !!t.priority };
}

export async function deleteTaskRemote(id: number): Promise<void> {
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

// ---- Agent panes ---------------------------------------------------------------

export interface PaneStat { label: string; value: string; hint?: string }
export interface PaneItem {
  id: number | string;
  title: string;
  detail?: string;
  meta?: string;
  flag?: boolean;
  done?: boolean;
  ts?: number;
  /** Row is backed by the items table — show universal triage (sorted/defer). */
  triage?: boolean;
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
  actions: string[];
  chat_hint: string;
}

/** Zero-credit read: the agent's live workspace data from D1. */
export async function fetchAgentPane(agentId: string): Promise<AgentPane> {
  const res = await fetch(`/api/agents/${agentId}/pane`);
  if (!res.ok) throw new Error(`pane failed (${res.status})`);
  return (await res.json()) as AgentPane;
}

export async function toggleVip(personId: number): Promise<boolean> {
  const res = await fetch(`/api/people/${personId}/vip`, { method: 'POST' });
  if (!res.ok) throw new Error('vip toggle failed');
  const json = (await res.json()) as { vip: boolean };
  return json.vip;
}

export async function addMemoryRemote(content: string, agent = 'SCRIBE'): Promise<void> {
  const res = await fetch('/api/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, agent }),
  });
  if (!res.ok) throw new Error('memory add failed');
}

export async function addDecisionRemote(title: string, rationale: string): Promise<void> {
  const res = await fetch('/api/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, rationale }),
  });
  if (!res.ok) throw new Error('decision add failed');
}

// ---- Universal triage -------------------------------------------------------------
// Every prompt/message/notice can be marked sorted (dealt with) or deferred.
// One state in D1, reflected system-wide. Zero model credits.

export type TriageAction = 'sorted' | 'deferred' | 'reopen';
export type DeferChoice = '3h' | 'tomorrow' | 'nextweek' | 'indefinite';

export const DEFER_CHOICES: { id: DeferChoice; label: string }[] = [
  { id: '3h', label: 'In 3 hours' },
  { id: 'tomorrow', label: 'Tomorrow 9am' },
  { id: 'nextweek', label: 'Next week' },
  { id: 'indefinite', label: 'Someday' },
];

export interface TriageCounts {
  open_attention: number;
  deferred: number;
  sorted_today: number;
}

export interface TriageOverlayData {
  overlay: Record<string, { status: string; itemId: number }>;
  counts: TriageCounts;
}

export async function triageItemRemote(id: number, action: TriageAction, defer?: DeferChoice): Promise<void> {
  const res = await fetch(`/api/triage/item/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, defer }),
  });
  if (!res.ok) throw new Error('triage failed');
}

export async function triageRefRemote(source: string, ref: string, action: TriageAction, defer?: DeferChoice): Promise<void> {
  const res = await fetch('/api/triage/ref', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, ref, action, defer }),
  });
  if (!res.ok) throw new Error('triage failed');
}

export async function fetchTriageOverlay(): Promise<TriageOverlayData> {
  const res = await fetch('/api/triage/overlay');
  if (!res.ok) throw new Error('overlay failed');
  return (await res.json()) as TriageOverlayData;
}

export interface DeferredItem {
  id: number;
  source: string;
  channel?: string | null;
  from_name?: string | null;
  title?: string | null;
  text?: string | null;
  attention_reason?: string | null;
  deferred_until?: number | null;
  triaged_at?: number | null;
}

export async function fetchDeferredItems(): Promise<DeferredItem[]> {
  const res = await fetch('/api/triage/deferred');
  if (!res.ok) throw new Error('deferred failed');
  const data = (await res.json()) as { items: DeferredItem[] };
  return data.items ?? [];
}

export async function deferTaskRemote(id: number, defer: DeferChoice): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/defer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defer }),
  });
  if (!res.ok) throw new Error('task defer failed');
}

export async function undeferTaskRemote(id: number): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/undefer`, { method: 'POST' });
  if (!res.ok) throw new Error('task undefer failed');
}

// ---- Usage / credits --------------------------------------------------------------

export interface UsageBucket { calls: number; tokens: number; cost: number }
export interface UsageSummaryData {
  today: UsageBucket;
  week: UsageBucket;
  all: UsageBucket;
  by_model: { model: string; calls: number; tokens: number; cost: number }[];
  by_purpose: { purpose: string; calls: number; tokens: number; cost: number }[];
  recent: { model: string; purpose: string; total_tokens: number; cost: number; created_at: number }[];
  daily: { day: string; calls: number; tokens: number; cost: number }[];
  credits?: { total_credits: number; total_usage: number; remaining: number };
  credits_error?: string;
}

/** Local spend ledger + live OpenRouter account credit. Zero model credits. */
export async function fetchUsage(): Promise<UsageSummaryData> {
  const res = await fetch('/api/usage');
  if (!res.ok) throw new Error('usage failed');
  return (await res.json()) as UsageSummaryData;
}
