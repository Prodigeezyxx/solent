import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react';
import { actOnLoop, fetchLoops, type Loop } from '../lib/api';

/**
 * OPEN LOOPS — commitments in flight.
 *   inbound  = you OWE someone a reply/action    (they asked you)
 *   outbound = you are WAITING on someone         (you asked them)
 * Sorted oldest-first: the longest-neglected commitment is the most dangerous.
 */

function ageOf(l: Loop): { label: string; days: number } {
  const opened = l.opened_ts ? new Date(l.opened_ts).getTime() : l.created_at;
  const days = Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
  if (days === 0) {
    const hrs = Math.max(1, Math.floor((Date.now() - opened) / 3_600_000));
    return { label: `${hrs}h`, days };
  }
  return { label: `${days}d`, days };
}

export default function OpenLoops({ refreshKey, onDraft }: { refreshKey: number; onDraft: (text: string) => void }) {
  const [loops, setLoops] = useState<Loop[]>([]);
  const [tab, setTab] = useState<'all' | 'inbound' | 'outbound'>('all');

  const load = useCallback(() => {
    fetchLoops().then(setLoops).catch(() => setLoops([]));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id: number, action: 'resolve' | 'dismiss') => {
    setLoops((ls) => ls.filter((l) => l.id !== id));
    try { await actOnLoop(id, action); } catch { load(); }
  };

  const shown = loops.filter((l) => tab === 'all' || l.direction === tab);
  const owe = loops.filter((l) => l.direction === 'inbound').length;
  const waiting = loops.filter((l) => l.direction === 'outbound').length;

  return (
    <section className="rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-nexus-border/50">
        <div>
          <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest">
            <RefreshCcw className="w-3.5 h-3.5" /> OPEN LOOPS
          </span>
          <h2 className="text-nexus-text text-sm font-semibold mt-1">Commitments in flight</h2>
        </div>
        <div className="flex items-center gap-1">
          {([['all', `all ${loops.length}`], ['inbound', `you owe ${owe}`], ['outbound', `waiting ${waiting}`]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                tab === id ? 'bg-nexus-mint/10 text-nexus-mint' : 'text-nexus-dim hover:text-nexus-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="px-4 py-6 text-[10px] text-nexus-dim text-center">
          No open loops — nothing owed, nothing awaited. Loops are derived automatically from every pass.
        </p>
      )}

      <AnimatePresence initial={false}>
        {shown.map((l) => {
          const age = ageOf(l);
          const stale = age.days >= 2;
          const inbound = l.direction === 'inbound';
          return (
            <motion.div
              key={l.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 24 }}
              className={`flex items-start gap-3 px-4 py-3 border-b border-nexus-border/40 last:border-0 hover:bg-white/[.02] transition-colors ${stale ? 'bg-nexus-orange/[.03]' : ''}`}
            >
              <span className={`mt-0.5 w-6 h-6 rounded grid place-items-center shrink-0 ${inbound ? 'bg-nexus-orange/10 text-nexus-orange' : 'bg-nexus-blue/10 text-nexus-blue'}`}>
                {inbound ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-[11px] font-medium text-zinc-300">
                    {inbound ? <>You owe <span className="text-nexus-orange">{l.counterparty}</span></> : <>Waiting on <span className="text-nexus-blue">{l.counterparty}</span></>}
                  </strong>
                  {l.channel && <span className="px-1.5 py-0.5 rounded bg-nexus-border/60 text-[9px] font-mono text-nexus-dim">{l.channel}</span>}
                  <span className={`text-[9px] font-mono ${stale ? 'text-nexus-orange' : 'text-nexus-dim'}`}>{age.label} old{stale ? ' ⚠' : ''}</span>
                </div>
                <p className="text-[11px] text-nexus-muted leading-relaxed mt-0.5 line-clamp-2">{l.ask}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <button
                  onClick={() => onDraft(
                    inbound
                      ? `Draft my reply to ${l.counterparty}'s ask (${l.channel ?? l.source}): "${l.ask}"`
                      : `Draft a polite follow-up nudge to ${l.counterparty} — they haven't replied to my ask (${age.label} ago): "${l.ask}"`,
                  )}
                  className="text-[9px] font-mono text-nexus-dim hover:text-nexus-mint transition-colors px-1"
                  title={inbound ? 'Draft reply' : 'Draft follow-up nudge'}
                >
                  {inbound ? 'reply →' : 'nudge →'}
                </button>
                <button onClick={() => act(l.id, 'resolve')} className="p-1 rounded text-nexus-dim hover:text-nexus-mint transition-colors" title="Mark handled">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => act(l.id, 'dismiss')} className="p-1 rounded text-nexus-dim hover:text-nexus-orange transition-colors" title="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
