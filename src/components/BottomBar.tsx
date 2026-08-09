import { useEffect, useState } from 'react';
import { Command, CheckCircle2, Coins, Network } from 'lucide-react';
import { fetchUsage, type UsageSummaryData } from '../lib/api';

interface BottomBarProps {
  onOpenCmd: () => void;
  prioritiesDone: number;
  prioritiesTotal: number;
  /** bump to refresh the credit chip (e.g. brief generated_at) */
  refreshKey?: number;
  onOpenLedger?: () => void;
}

const fmt = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

export default function BottomBar({ onOpenCmd, prioritiesDone, prioritiesTotal, refreshKey, onOpenLedger }: BottomBarProps) {
  const [usage, setUsage] = useState<UsageSummaryData | null>(null);

  useEffect(() => {
    let alive = true;
    fetchUsage().then((u) => { if (alive) setUsage(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [refreshKey]);

  return (
    <footer className="shrink-0 min-h-10 border-t border-solent-border flex items-center justify-between px-4 pb-[env(safe-area-inset-bottom)] bg-solent-bg text-xs font-mono select-none z-30">
      <div className="flex items-center gap-4 text-solent-dim">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-1.5 hover:text-solent-mint transition-colors px-2 py-1 rounded bg-solent-border/20 border border-solent-border/50 hover:bg-solent-border/40"
        >
          <Command className="w-3 h-3" />
          <span>CMD (⌘K)</span>
        </button>

        <div className="h-3 w-px bg-solent-border" />

        <div className="items-center gap-2 hidden md:flex">
          <CheckCircle2 className="w-3 h-3 text-solent-mint" />
          <span>{prioritiesDone}/{prioritiesTotal} Daily Priorities</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-solent-dim">
        <div className="items-center gap-1 hidden sm:flex">
          <Network className="w-3 h-3 text-solent-mint" />
          <span>Graph Sync: ON</span>
        </div>
        {/* Live OpenRouter credit — click for LEDGER's full breakdown */}
        <button
          onClick={onOpenLedger}
          title={usage ? `Today: ${fmt(usage.today.cost)} (${usage.today.calls} calls) · 7d: ${fmt(usage.week.cost)} — click for LEDGER breakdown` : 'Model spend'}
          className="flex items-center gap-1 hover:text-solent-text transition-colors group"
        >
          <Coins className="w-3 h-3 group-hover:text-solent-mint" />
          <span>
            {usage?.credits
              ? `Credit: ${fmt(usage.credits.remaining)}`
              : usage
                ? `Spend 7d: ${fmt(usage.week.cost)}`
                : 'Credit: —'}
          </span>
        </button>
      </div>
    </footer>
  );
}
