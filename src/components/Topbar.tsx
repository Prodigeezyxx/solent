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
    <header className="shrink-0 border-b border-solent-border bg-solent-bg/80 backdrop-blur-md z-30 pt-[env(safe-area-inset-top)]">
      <div className="h-14 flex items-center justify-between px-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-solent-mint font-mono text-xs font-bold tracking-widest shrink-0">
          <Hexagon className="w-4 h-4 fill-solent-mint/20" />
          <span>SOLENT</span>
        </div>
        <div className="h-4 w-px bg-solent-border mx-1 hidden sm:block" />
        <nav className="items-center gap-1 bg-black/40 rounded-lg p-1 border border-solent-border/50 hidden md:flex" aria-label="Operating modes">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
                mode === m ? 'bg-solent-mint/10 text-solent-mint' : 'text-solent-dim hover:text-solent-text'
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
          className="flex items-center gap-2 text-solent-dim font-mono text-xs hover:text-solent-text cursor-pointer transition-colors group"
        >
          <Search className="w-4 h-4 group-hover:text-solent-mint transition-colors" />
          <span className="hidden lg:inline">Global Search (⌘F)</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPalette}
            className="relative text-solent-dim hover:text-solent-mint transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-solent-mint rounded-full animate-pulse" />
          </button>
          <button className="w-6 h-6 rounded-sm bg-solent-border flex items-center justify-center text-xs font-mono font-bold hover:bg-solent-mint/20 hover:text-solent-mint transition-colors" aria-label="Profile">
            IO
          </button>
        </div>
      </div>
      </div>

      {/* MOBILE MODE STRIP — the desktop nav is hidden below md, which used to
          strand phone users in one mode. A horizontally-scrollable strip with
          44px touch targets makes every mode reachable with a thumb. */}
      <nav
        className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none]"
        aria-label="Operating modes"
      >
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`shrink-0 min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium border transition-colors ${
              mode === m
                ? 'bg-solent-mint/10 text-solent-mint border-solent-mint/30'
                : 'text-solent-dim border-solent-border/50 hover:text-solent-text active:bg-solent-border/40'
            }`}
          >
            {m}
          </button>
        ))}
      </nav>
    </header>
  );
}
