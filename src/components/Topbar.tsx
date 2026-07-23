import { Search, Bell, Hexagon, Zap } from 'lucide-react';
import type { Mode } from '../types';

interface TopbarProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  onOpenPalette: () => void;
}

const MODES: Mode[] = ['COMMAND', 'FOCUS', 'RECEIVE', 'GRAPH', 'DEEP', 'PERFORMANCE'];

export default function Topbar({ mode, setMode, onOpenPalette }: TopbarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-nexus-border bg-nexus-bg/80 flex items-center justify-between px-4 backdrop-blur-md z-30">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-nexus-mint font-mono text-xs font-bold tracking-widest shrink-0">
          <Hexagon className="w-4 h-4 fill-nexus-mint/20" />
          <span>NEXUS</span>
        </div>
        <div className="h-4 w-px bg-nexus-border mx-1 hidden sm:block" />
        <nav className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-nexus-border/50 hidden md:flex" aria-label="Operating modes">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
                mode === m ? 'bg-nexus-mint/10 text-nexus-mint' : 'text-nexus-dim hover:text-nexus-text'
              }`}
            >
              {m}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-2 text-nexus-dim font-mono text-xs hover:text-nexus-text cursor-pointer transition-colors group"
        >
          <Search className="w-4 h-4 group-hover:text-nexus-mint transition-colors" />
          <span className="hidden lg:inline">Global Search (⌘F)</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPalette}
            className="relative text-nexus-dim hover:text-nexus-mint transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-nexus-mint rounded-full animate-pulse" />
          </button>
          <button className="w-6 h-6 rounded-sm bg-nexus-border flex items-center justify-center text-xs font-mono font-bold hover:bg-nexus-mint/20 hover:text-nexus-mint transition-colors" aria-label="Profile">
            IO
          </button>
        </div>
      </div>
    </header>
  );
}
