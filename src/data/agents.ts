import type { Agent, Task, Signal, Command } from '../types';

export const AGENTS: Agent[] = [
  { id: 'CONDUCTOR', name: 'CONDUCTOR', job: 'Orchestrator', color: '#ffffff', status: 'working' },
  { id: 'ATLAS', name: 'ATLAS', job: 'Chief of Staff', color: '#7CFFB2', status: 'idle' },
  { id: 'SCRIBE', name: 'SCRIBE', job: 'External Memory', color: '#94a3b8', status: 'working' },
  { id: 'ORACLE', name: 'ORACLE', job: 'Signal Radar', color: '#38bdf8', status: 'idle' },
  { id: 'HERMES', name: 'HERMES', job: 'Comms', color: '#a78bfa', status: 'idle' },
  { id: 'HUNTER', name: 'HUNTER', job: 'GTM Radar', color: '#fb923c', status: 'idle' },
  { id: 'MUSE', name: 'MUSE', job: 'Content Engine', color: '#f472b6', status: 'idle' },
  { id: 'VAULT', name: 'VAULT', job: 'Knowledge Base', color: '#fbbf24', status: 'idle' },
  { id: 'FORGE', name: 'FORGE', job: 'Product Partner', color: '#f87171', status: 'idle' },
  { id: 'LEDGER', name: 'LEDGER', job: 'Metrics', color: '#4ade80', status: 'idle' },
  { id: 'CIRCLE', name: 'CIRCLE', job: 'Network CRM', color: '#2dd4bf', status: 'idle' },
  { id: 'JUDGE', name: 'JUDGE', job: 'Decision Journal', color: '#c084fc', status: 'idle' },
  { id: 'GHOST', name: 'GHOST', job: 'Personal Layer', color: '#64748b', status: 'idle' },
];

export const TASKS: Task[] = [
  { id: 1, title: 'Review Placer.ai partnership brief', context: 'realmspace · ORACLE', time: '09:30', done: false, priority: true },
  { id: 2, title: 'Approve Expo outreach sequence', context: 'Floats XR · HERMES', time: '11:00', done: false, priority: true },
  { id: 3, title: 'Send revised board metrics', context: 'realmspace · LEDGER', time: '14:30', done: false, priority: true },
  { id: 4, title: 'Capture venue pricing insight', context: 'Inbox · SCRIBE', time: 'Anytime', done: true },
];

export const SIGNALS: Signal[] = [
  { label: 'Market', title: 'Location intelligence demand is moving upmarket', meta: 'ORACLE · 18 min ago', score: '91%' },
  { label: 'Network', title: 'Warm path found to Momentum Worldwide', meta: 'HUNTER · 42 min ago', score: '87%' },
  { label: 'Product', title: 'Booth-as-a-service pattern repeated across 4 calls', meta: 'SCRIBE · Yesterday', score: '83%' },
];

export const COMMANDS: Command[] = [
  { icon: 'capture', label: 'Capture a thought', hint: 'Route to SCRIBE', action: 'capture' },
  { icon: 'focus', label: 'Start focus mode', hint: 'Block distractions for 50 minutes', action: 'focus' },
  { icon: 'search', label: 'Search the knowledge graph', hint: 'People, projects, decisions, notes', action: 'search' },
  { icon: 'brief', label: 'Prepare my daily brief', hint: 'Ask ATLAS to synthesize priorities', action: 'brief' },
];

export const SCHEDULE = [
  { time: '10:00', kind: 'focus', title: 'Deep work block', detail: 'Placer.ai partnership brief · 50m' },
  { time: '11:30', kind: 'meeting', title: 'Floats XR product sync', detail: '4 attendees · Google Meet' },
  { time: '14:30', kind: 'admin', title: 'Board metrics review', detail: 'with LEDGER · 30m' },
];
