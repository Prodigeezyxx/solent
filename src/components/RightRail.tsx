import { Clock, Link as LinkIcon, PenLine, User, X } from 'lucide-react';
import type { Agent } from '../types';
import type { Brief } from '../lib/api';

interface RightRailProps {
  agent: Agent;
  open?: boolean;
  onClose?: () => void;
  brief: Brief | null;
}

const SOURCE_COLOR: Record<string, string> = {
  pumble: '#a78bfa',
  gmail: '#fb923c',
  zoho: '#38bdf8',
};

export default function RightRail({ agent, open = true, onClose, brief }: RightRailProps) {
  const sources = (brief?.sources ?? []).filter((s) => s.configured);
  const signals = brief?.signals ?? [];
  const replies = brief?.replies ?? [];

  return (
    <aside
      className={`w-72 shrink-0 border-l border-nexus-border bg-nexus-surface/40 flex-col overflow-y-auto hidden lg:flex ${
        open ? 'flex' : 'hidden'
      }`}
    >
      <div className="p-4 border-b border-nexus-border/50 flex items-start justify-between">
        <div>
          <h2 className="text-xs font-mono tracking-widest text-nexus-dim uppercase mb-1">Context Rail</h2>
          <p className="text-[10px] text-nexus-dim">Live from the last pass</p>
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
            <LinkIcon className="w-3 h-3" /> Connected sources
          </h3>
          {sources.length === 0 && <p className="text-[10px] text-nexus-dim">No sources connected yet.</p>}
          <div className="space-y-2">
            {sources.map((s) => (
              <div
                key={s.source}
                className="bg-nexus-border/20 border border-nexus-border rounded p-2 text-xs flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.ok ? SOURCE_COLOR[s.source] ?? '#7CFFB2' : '#f87171' }} />
                <span className="uppercase font-mono text-[10px]">{s.source}</span>
                <span className="text-[10px] font-mono text-nexus-dim ml-auto">{s.ok ? `${s.count} items` : 'error'}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <Clock className="w-3 h-3" /> Signals
          </h3>
          {signals.length === 0 && <p className="text-[10px] text-nexus-dim">Distilled signals appear here after a pass.</p>}
          <div className="space-y-2 relative before:absolute before:inset-y-0 before:left-1.5 before:w-px before:bg-nexus-border">
            {signals.map((m, i) => (
              <div key={i} className="relative pl-6">
                <div className={`absolute left-1 top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-nexus-surface ${i === 0 ? 'bg-nexus-mint' : 'bg-nexus-border'}`} />
                <div className="text-xs text-zinc-300">{m.title}</div>
                <div className="text-[10px] font-mono text-nexus-dim mt-1">{m.label} · {m.score}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <PenLine className="w-3 h-3" /> Drafts
          </h3>
          {replies.length === 0 && <p className="text-[10px] text-nexus-dim">Reply drafts land here when a pass finds messages waiting on you.</p>}
          <div className="space-y-1">
            {replies.map((d, i) => (
              <div key={i} className="text-xs text-zinc-400 flex items-center gap-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SOURCE_COLOR[d.channel] ?? '#7CFFB2' }} />
                <span className="truncate">to {d.to} · {d.re}</span>
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
