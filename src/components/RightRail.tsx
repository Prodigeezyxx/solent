import { Activity, Clock, FileText, Link as LinkIcon, User, X } from 'lucide-react';
import type { Agent } from '../types';

interface RightRailProps {
  agent: Agent;
  open?: boolean;
  onClose?: () => void;
}

const RELATED = [
  { name: 'Placer.ai', type: 'Company', color: '#60a5fa' },
  { name: 'Bob Cooney', type: 'Person', color: '#fb923c' },
];

const MEMORY = [
  { text: '“Agencies will resell better than direct”', by: 'SCRIBE', when: '2d ago', fresh: true },
  { text: 'Idea: Booth-as-a-service pricing model', by: 'VAULT', when: '5d ago', fresh: false },
];

const DOCS = ['realmspace ops doc v2', 'Q3 Board Deck'];

export default function RightRail({ agent, open = true, onClose }: RightRailProps) {
  return (
    <aside
      className={`w-72 shrink-0 border-l border-nexus-border bg-nexus-surface/40 flex-col overflow-y-auto hidden lg:flex ${
        open ? 'flex' : 'hidden'
      }`}
    >
      <div className="p-4 border-b border-nexus-border/50 flex items-start justify-between">
        <div>
          <h2 className="text-xs font-mono tracking-widest text-nexus-dim uppercase mb-1">Context Rail</h2>
          <p className="text-[10px] text-nexus-dim">Active Graph Neighborhood</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-nexus-dim hover:text-white lg:hidden" aria-label="Close context">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        <div className="flex items-center gap-3 rounded-lg border border-nexus-border bg-nexus-border/20 p-3">
          <div
            className="w-8 h-8 rounded-md grid place-items-center font-mono text-xs font-bold"
            style={{ backgroundColor: `${agent.color}1a`, color: agent.color, border: `1px solid ${agent.color}55` }}
          >
            {agent.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono font-bold" style={{ color: agent.color }}>{agent.name}</div>
            <div className="text-[10px] text-nexus-dim truncate">{agent.job}</div>
          </div>
          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded border border-nexus-mint/30 text-nexus-mint uppercase">
            {agent.status}
          </span>
        </div>

        <section>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-mint mb-3 uppercase flex items-center gap-2">
            <LinkIcon className="w-3 h-3" /> Related Entities
          </h3>
          <div className="space-y-2">
            {RELATED.map((r) => (
              <div
                key={r.name}
                className="bg-nexus-border/20 border border-nexus-border rounded p-2 text-xs flex items-center gap-2 hover:bg-nexus-border/40 cursor-pointer transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span>{r.name}</span>
                <span className="text-[10px] font-mono text-nexus-dim ml-auto">{r.type}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <Clock className="w-3 h-3" /> Recent Memory
          </h3>
          <div className="space-y-2 relative before:absolute before:inset-y-0 before:left-1.5 before:w-px before:bg-nexus-border">
            {MEMORY.map((m) => (
              <div key={m.text} className="relative pl-6">
                <div
                  className={`absolute left-1 top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-nexus-surface ${
                    m.fresh ? 'bg-nexus-mint' : 'bg-nexus-border'
                  }`}
                />
                <div className="text-xs text-zinc-300">{m.text}</div>
                <div className="text-[10px] font-mono text-nexus-dim mt-1">Logged by {m.by} · {m.when}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <FileText className="w-3 h-3" /> Relevant Docs
          </h3>
          <div className="space-y-1">
            {DOCS.map((d) => (
              <div
                key={d}
                className="text-xs hover:text-nexus-mint cursor-pointer text-zinc-400 flex items-center gap-2 py-1"
              >
                <FileText className="w-3 h-3 opacity-50" />
                <span className="truncate">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <button className="w-full flex items-center justify-center gap-2 text-[11px] text-nexus-dim hover:text-nexus-mint border border-nexus-border rounded-lg py-2 transition-colors">
          <User className="w-3 h-3" /> Open thread with {agent.name}
        </button>
      </div>
    </aside>
  );
}
