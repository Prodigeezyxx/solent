import { Agent } from '../types';

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
