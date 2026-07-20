import { motion } from 'motion/react';
import { AGENTS } from '../data/agents';

export default function LeftRail() {
  const activeAgents = AGENTS.filter(a => a.id !== 'CONDUCTOR'); // Conductor is implicit

  return (
    <aside className="w-64 border-r border-nexus-border bg-nexus-dark/30 flex flex-col shrink-0 overflow-y-auto hidden md:flex">
      <div className="p-4 border-b border-nexus-border/50">
        <h2 className="text-xs font-mono tracking-widest text-nexus-dim uppercase mb-1">Agent Council</h2>
        <p className="text-[10px] text-nexus-dim">12 Specialists Online</p>
      </div>
      
      <div className="flex-1 py-2">
        {activeAgents.map(agent => (
          <div 
            key={agent.id}
            className="flex items-center gap-3 px-4 py-2 hover:bg-nexus-border/40 cursor-pointer transition-colors group"
          >
            <div className="relative flex items-center justify-center w-3 h-3">
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
                <span className="text-xs font-bold font-mono tracking-wide group-hover:text-white transition-colors" style={{ color: agent.status === 'working' ? agent.color : '#e4e4e7' }}>
                  {agent.name}
                </span>
                {agent.status === 'working' && (
                  <span className="text-[9px] font-mono px-1 rounded bg-nexus-bg text-nexus-dim border border-nexus-border">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-[10px] text-nexus-dim block truncate">
                {agent.job}
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
