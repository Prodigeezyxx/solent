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
  onReply: (chunk: { content: string }) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// Streams a CONDUCTOR response from the Worker via Server-Sent Events.
export async function streamChat(messages: ChatPayload[], handlers: ChatStreamHandlers): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
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
  source: 'pumble' | 'gmail' | 'zoho';
  ref: string;
  from: string;
  title: string;
  text: string;
  ts: string;
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
  cached: boolean;
  headline: string;
  summary: string;
  priorities: { title: string; context: string; urgency: 'high' | 'medium' | 'low'; source_ref: string }[];
  signals: { label: string; title: string; meta: string; score: string }[];
  replies: { to: string; channel: string; re: string; draft: string }[];
  sources: BriefSourceMeta[];
  inbox: InboxItem[];
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
