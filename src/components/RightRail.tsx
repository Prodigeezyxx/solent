import { Activity, Clock, FileText, Link as LinkIcon, User } from 'lucide-react';

export default function RightRail() {
  return (
    <aside className="w-72 border-l border-nexus-border bg-nexus-dark/30 flex flex-col shrink-0 overflow-y-auto hidden lg:flex">
      <div className="p-4 border-b border-nexus-border/50">
        <h2 className="text-xs font-mono tracking-widest text-nexus-dim uppercase mb-1">Context Rail</h2>
        <p className="text-[10px] text-nexus-dim">Active Graph Neighborhood</p>
      </div>

      <div className="p-4 space-y-6">
        {/* Linked Entities */}
        <div>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-mint mb-3 uppercase flex items-center gap-2">
            <LinkIcon className="w-3 h-3" /> Related Entities
          </h3>
          <div className="space-y-2">
            <div className="bg-nexus-border/20 border border-nexus-border rounded p-2 text-xs flex items-center gap-2 hover:bg-nexus-border/40 cursor-pointer transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Placer.ai</span>
              <span className="text-[10px] font-mono text-nexus-dim ml-auto">Company</span>
            </div>
            <div className="bg-nexus-border/20 border border-nexus-border rounded p-2 text-xs flex items-center gap-2 hover:bg-nexus-border/40 cursor-pointer transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span>Bob Cooney</span>
              <span className="text-[10px] font-mono text-nexus-dim ml-auto">Person</span>
            </div>
          </div>
        </div>

        {/* Recent Memories */}
        <div>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <Clock className="w-3 h-3" /> Recent Memory
          </h3>
          <div className="space-y-2 relative before:absolute before:inset-y-0 before:left-1.5 before:w-px before:bg-nexus-border">
            <div className="relative pl-6">
              <div className="absolute left-1 top-1.5 w-1.5 h-1.5 rounded-full bg-nexus-mint ring-2 ring-nexus-dark" />
              <div className="text-xs text-zinc-300">"Agencies will resell better than direct"</div>
              <div className="text-[10px] font-mono text-nexus-dim mt-1">Logged by SCRIBE • 2d ago</div>
            </div>
            <div className="relative pl-6">
              <div className="absolute left-1 top-1.5 w-1.5 h-1.5 rounded-full bg-nexus-border ring-2 ring-nexus-dark" />
              <div className="text-xs text-zinc-400">Idea: Booth-as-a-service pricing model</div>
              <div className="text-[10px] font-mono text-nexus-dim mt-1">Logged by VAULT • 5d ago</div>
            </div>
          </div>
        </div>

        {/* Relevant Docs */}
        <div>
          <h3 className="text-[10px] font-mono tracking-widest text-nexus-dim mb-3 uppercase flex items-center gap-2">
            <FileText className="w-3 h-3" /> Relevant Docs
          </h3>
          <div className="space-y-1">
            <div className="text-xs hover:text-nexus-mint cursor-pointer text-zinc-400 flex items-center gap-2 py-1">
              <FileText className="w-3 h-3 opacity-50" />
              <span className="truncate">realmspace ops doc v2</span>
            </div>
            <div className="text-xs hover:text-nexus-mint cursor-pointer text-zinc-400 flex items-center gap-2 py-1">
              <FileText className="w-3 h-3 opacity-50" />
              <span className="truncate">Q3 Board Deck</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
