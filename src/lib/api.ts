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

export async function toggleTaskRemote(id: number): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error('toggle failed');
  const t = (await res.json()) as Task;
  return { ...t, done: !!t.done, priority: !!t.priority };
}
