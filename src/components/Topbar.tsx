import { Search, Bell, Hexagon, Zap } from 'lucide-react';
import { Mode } from '../types';

interface TopbarProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export default function Topbar({ mode, setMode }: TopbarProps) {
  const modes: Mode[] = ['FOCUS', 'COMMAND', 'RECEIVE', 'DEEP', 'PERFORMANCE'];

  return (
    <header className="h-12 border-b border-nexus-border flex items-center justify-between px-4 shrink-0 bg-nexus-dark/50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-nexus-mint font-mono text-xs font-bold tracking-widest">
          <Hexagon className="w-4 h-4 fill-nexus-mint/20" />
          <span>NEXUS</span>
        </div>
        <div className="h-4 w-px bg-nexus-border mx-2" />
        <div className="flex items-center gap-1 bg-black/50 rounded p-1 border border-nexus-border/50">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
                mode === m ? 'bg-nexus-mint/10 text-nexus-mint' : 'text-nexus-dim hover:text-nexus-text'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="text-nexus-dim text-[10px] font-mono ml-2 hidden md:block">
          ⌘M to toggle
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-nexus-dim font-mono text-xs hover:text-nexus-text cursor-pointer transition-colors group">
          <Search className="w-4 h-4 group-hover:text-nexus-mint transition-colors" />
          <span>Global Search (⌘F)</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="relative text-nexus-dim hover:text-nexus-mint transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-nexus-mint rounded-full animate-pulse" />
          </button>
          <button className="w-6 h-6 rounded-sm bg-nexus-border flex items-center justify-center text-xs font-mono font-bold hover:bg-nexus-mint/20 hover:text-nexus-mint transition-colors">
            IR
          </button>
        </div>
      </div>
    </header>
  );
}
