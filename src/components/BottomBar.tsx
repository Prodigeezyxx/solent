import { Command, CheckCircle2, Zap, Network } from 'lucide-react';

interface BottomBarProps {
  onOpenCmd: () => void;
  prioritiesDone: number;
  prioritiesTotal: number;
}

export default function BottomBar({ onOpenCmd, prioritiesDone, prioritiesTotal }: BottomBarProps) {
  return (
    <footer className="h-10 shrink-0 border-t border-solent-border flex items-center justify-between px-4 bg-solent-bg text-xs font-mono select-none z-30">
      <div className="flex items-center gap-4 text-solent-dim">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-1.5 hover:text-solent-mint transition-colors px-2 py-1 rounded bg-solent-border/20 border border-solent-border/50 hover:bg-solent-border/40"
        >
          <Command className="w-3 h-3" />
          <span>CMD (⌘K)</span>
        </button>

        <div className="h-3 w-px bg-solent-border" />

        <div className="flex items-center gap-2 hidden md:flex">
          <CheckCircle2 className="w-3 h-3 text-solent-mint" />
          <span>{prioritiesDone}/{prioritiesTotal} Daily Priorities</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-solent-dim">
        <div className="flex items-center gap-1 hidden sm:flex">
          <Network className="w-3 h-3 text-solent-mint" />
          <span>Graph Sync: ON</span>
        </div>
        <div className="flex items-center gap-1 hover:text-solent-text cursor-pointer transition-colors group">
          <Zap className="w-3 h-3 group-hover:text-solent-mint" />
          <span>Energy: HIGH</span>
        </div>
      </div>
    </footer>
  );
}
