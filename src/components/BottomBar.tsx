import { Command, CheckCircle2, Zap, Network } from 'lucide-react';

interface BottomBarProps {
  onOpenCmd: () => void;
  prioritiesDone: number;
  prioritiesTotal: number;
}

export default function BottomBar({ onOpenCmd, prioritiesDone, prioritiesTotal }: BottomBarProps) {
  return (
    <footer className="h-10 shrink-0 border-t border-nexus-border flex items-center justify-between px-4 bg-nexus-bg text-xs font-mono select-none z-30">
      <div className="flex items-center gap-4 text-nexus-dim">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-1.5 hover:text-nexus-mint transition-colors px-2 py-1 rounded bg-nexus-border/20 border border-nexus-border/50 hover:bg-nexus-border/40"
        >
          <Command className="w-3 h-3" />
          <span>CMD (⌘K)</span>
        </button>

        <div className="h-3 w-px bg-nexus-border" />

        <div className="flex items-center gap-2 hidden md:flex">
          <CheckCircle2 className="w-3 h-3 text-nexus-mint" />
          <span>{prioritiesDone}/{prioritiesTotal} Daily Priorities</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-nexus-dim">
        <div className="flex items-center gap-1 hidden sm:flex">
          <Network className="w-3 h-3 text-nexus-mint" />
          <span>Graph Sync: ON</span>
        </div>
        <div className="flex items-center gap-1 hover:text-nexus-text cursor-pointer transition-colors group">
          <Zap className="w-3 h-3 group-hover:text-nexus-mint" />
          <span>Energy: HIGH</span>
        </div>
      </div>
    </footer>
  );
}
