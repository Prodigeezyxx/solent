import { motion } from 'motion/react';
import { Zap } from 'lucide-react';
import type { Agent, AgentRole } from '../types';

interface LeftRailProps {
  agents: Agent[];
  selectedAgent: AgentRole;
  onSelectAgent: (id: AgentRole) => void;
}

export default function LeftRail({ agents, selectedAgent, onSelectAgent }: LeftRailProps) {
  const activeAgents = agents.filter((a) => a.id !== 'CONDUCTOR');
  const onlineCount = agents.filter((a) => a.status !== 'idle').length;

  return (
    <aside className="w-60 shrink-0 border-r border-solent-border bg-solent-surface/40 flex flex-col overflow-y-auto hidden md:flex">
      <div className="p-4 border-b border-solent-border/50">
        <h2 className="text-xs font-mono tracking-widest text-solent-dim uppercase mb-1">Agent Council</h2>
        <p className="text-[10px] text-solent-dim">{agents.length} Specialists · {onlineCount} active</p>
      </div>

      <div className="flex-1 py-2">
        {activeAgents.map((agent) => {
          const selected = agent.id === selectedAgent;
          return (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              aria-pressed={selected}
              className={`w-full flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors text-left group ${
                selected ? 'bg-solent-border/40' : 'hover:bg-solent-border/20'
              }`}
            >
              <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
                {agent.status === 'working' ? (
                  <motion.div
                    className="absolute w-2 h-2 rounded-full"
                    style={{ backgroundColor: agent.color }}
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                ) : agent.status === 'alert' ? (
                  <div className="absolute w-2 h-2 rounded-sm" style={{ backgroundColor: agent.color }} />
                ) : (
                  <div className="absolute w-1.5 h-1.5 rounded-full opacity-50" style={{ backgroundColor: agent.color }} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold font-mono tracking-wide group-hover:text-white transition-colors ${
                      selected ? 'text-solent-mint' : ''
                    }`}
                    style={agent.status === 'working' && !selected ? { color: agent.color } : undefined}
                  >
                    {agent.name}
                  </span>
                  {agent.status === 'working' && (
                    <span className="text-[9px] font-mono px-1 rounded bg-solent-bg text-solent-dim border border-solent-border">
                      ACTIVE
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-solent-dim block truncate">{agent.job}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-solent-border/50">
        <div className="flex items-center gap-2 text-[10px] font-mono text-solent-dim">
          <Zap className="w-3 h-3 text-solent-mint" />
          <span>Collective capacity 82%</span>
        </div>
      </div>
    </aside>
  );
}
