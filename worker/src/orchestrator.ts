import OpenAI from 'openai';
import type { D1Database } from '@cloudflare/workers-types';
import type { ChatMessage, Env, ToolCallResult } from './types';
import { agentListForPrompt, agentSystemPrompt } from './agents';
import { createTask, logAgentRun, logDecision, logMemory, toggleTask, listTasks } from './db';
import { loadSettings } from './settings';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'capture_task',
      description: 'Capture a new priority or to-do and route it to ATLAS. Use when the user asks to remember, track, or do something.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The task title' },
          context: { type: 'string', description: 'Where this came from, e.g. "gmail · HERMES" or a project name' },
          agent: { type: 'string', description: 'Agent responsible, usually ATLAS' },
        },
        required: ['title', 'agent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a task done or reopen it by id. Returns the updated task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Task id' },
          agent: { type: 'string', description: 'Agent performing the toggle, usually ATLAS' },
        },
        required: ['id', 'agent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_memory',
      description: 'Persist a durable insight or note to SCRIBE memory.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The distilled insight' },
          agent: { type: 'string', description: 'Owning agent, usually SCRIBE' },
          source: { type: 'string', description: 'Optional source, e.g. "client call" or "pumble #general"' },
        },
        required: ['content', 'agent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_decision',
      description: 'Record a decision with rationale to the JUDGE decision journal.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The decision in one line' },
          rationale: { type: 'string', description: 'Why this was decided and how we will know it worked' },
          agent: { type: 'string', description: 'Owning agent, usually JUDGE' },
        },
        required: ['title', 'rationale', 'agent'],
      },
    },
  },
];

function buildSystem(liveContext: string): string {
  return (
    'You are CONDUCTOR, the orchestrator of NEXUS, an AI-native personal command centre for the operator. ' +
    'You have a council of specialist agents you can dispatch by calling tools. Choose the right agent for each job.\n\n' +
    'Available agents:\n' +
    agentListForPrompt() +
    (liveContext ? `\n\nLive context from the last one-shot brief (Pumble + Gmail + Zoho):\n${liveContext}` : '') +
    '\n\nWhen you call a tool, the named agent performs it and it is logged. After tool calls, give the operator a short, ' +
    'human summary of what the council did and the single most important next step. Never expose raw tool JSON. ' +
    'Keep replies under 120 words unless asked to expand.'
  );
}

/** Zero-credit context injection: reads the cached brief from D1 (never triggers a model call). */
async function cachedBriefContext(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = '_brief_cache'").first<{ value: string }>();
    if (!row) return '';
    const b = JSON.parse(row.value) as { headline?: string; summary?: string; priorities?: { title: string; urgency: string }[] };
    const pr = (b.priorities ?? []).map((p) => `- [${p.urgency}] ${p.title}`).join('\n');
    return [b.headline ? `Headline: ${b.headline}` : '', b.summary ?? '', pr].filter(Boolean).join('\n').slice(0, 900);
  } catch {
    return '';
  }
}

export interface OrchestrationResult {
  reply: string;
  toolResults: ToolCallResult[];
}

export async function orchestrate(
  env: Env,
  history: ChatMessage[],
): Promise<OrchestrationResult> {
  const settings = await loadSettings(env.DB, env);

  // No key configured: deterministic stub so the UI works end-to-end without a real LLM.
  if (!settings.OPENROUTER_API_KEY) {
    return stubOrchestrate(history, env.DB);
  }

  const client = new OpenAI({
    apiKey: settings.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  const liveContext = await cachedBriefContext(env.DB);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystem(liveContext) },
    ...history.map((m) => ({
      role: m.role === 'agent' ? ('assistant' as const) : (m.role as 'user' | 'assistant' | 'system'),
      content: m.agent ? `[${m.agent}] ${m.content}` : m.content,
    })),
  ];

  const toolResults: ToolCallResult[] = [];
  let reply = '';

  // Allow up to 3 tool-call rounds.
  for (let round = 0; round < 3; round++) {
    const completion = await client.chat.completions.create({
      model: settings.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.4,
      stream: false,
    });

    const choice = completion.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        const res = await runTool(env.DB, call.function.name, args);
        toolResults.push(res);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(res),
        });
      }
      continue; // let the model respond after acting
    }

    reply = msg.content ?? '';
    break;
  }

  return { reply: reply || 'The council is processing. Try again in a moment.', toolResults };
}

async function runTool(db: D1Database, name: string, args: any): Promise<ToolCallResult> {
  const agent = typeof args.agent === 'string' ? args.agent : 'CONDUCTOR';
  switch (name) {
    case 'capture_task': {
      const task = await createTask(db, String(args.title), args.context ? String(args.context) : undefined);
      await logAgentRun(db, agent, 'capture_task', task.title);
      return { agent, action: 'Captured task', detail: task.title };
    }
    case 'complete_task': {
      const task = await toggleTask(db, Number(args.id));
      await logAgentRun(db, agent, 'complete_task', task ? `id ${task.id} -> done ${task.done}` : 'not found');
      return { agent, action: 'Toggled task', detail: task ? `#${task.id} ${task.title}` : `task ${args.id} not found` };
    }
    case 'log_memory': {
      await logMemory(db, String(args.content), agent, args.source ? String(args.source) : undefined);
      await logAgentRun(db, agent, 'log_memory', String(args.content).slice(0, 60));
      return { agent, action: 'Logged memory', detail: String(args.content).slice(0, 60) };
    }
    case 'log_decision': {
      await logDecision(db, String(args.title), String(args.rationale), agent);
      await logAgentRun(db, agent, 'log_decision', String(args.title));
      return { agent, action: 'Logged decision', detail: String(args.title) };
    }
    default:
      return { agent, action: 'Unknown tool', detail: name };
  }
}

// Deterministic fallback used when no API key is configured.
async function stubOrchestrate(history: ChatMessage[], db: D1Database): Promise<OrchestrationResult> {
  const last = history.filter((m) => m.role === 'user').pop();
  const text = (last?.content || '').toLowerCase();
  const toolResults: ToolCallResult[] = [];

  if (/capture|remember|track|todo|task/.test(text)) {
    const title = last!.content.replace(/^(capture|remember|track|add|task)\s*/i, '').trim() || 'New task';
    const task = await createTask(db, title, 'CONDUCTOR');
    await logAgentRun(db, 'ATLAS', 'capture_task', title);
    toolResults.push({ agent: 'ATLAS', action: 'Captured task', detail: title });
    return {
      reply: `[STUB · no API key] ATLAS captured “${title}” to your priority queue. Add OPENROUTER_API_KEY to enable real orchestration.`,
      toolResults,
    };
  }

  if (/decision|decide|judge/.test(text)) {
    await logAgentRun(db, 'JUDGE', 'log_decision', last!.content);
    toolResults.push({ agent: 'JUDGE', action: 'Logged decision', detail: last!.content.slice(0, 60) });
    return {
      reply: `[STUB · no API key] JUDGE logged this decision. Connect OPENROUTER_API_KEY for real reasoning.`,
      toolResults,
    };
  }

  const tasks = await listTasks(db);
  const open = tasks.filter((t) => !t.done).length;
  return {
    reply:
      `[STUB · no API key] CONDUCTOR here. You have ${open} open task(s). ` +
      `I can route captures, decisions, and memories to the council — set OPENROUTER_API_KEY to make this real.`,
    toolResults,
  };
}
