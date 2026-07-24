import { useState, useRef, useEffect } from 'react';
import { Check, Clock, ChevronDown } from 'lucide-react';
import {
  triageItemRemote,
  triageRefRemote,
  DEFER_CHOICES,
  type DeferChoice,
} from '../lib/api';

/**
 * Universal triage controls: ✓ Sorted (dealt with) + ⏰ Defer (with window picker).
 * Works either by item id (D1 items table) or by (source, ref) from the cached
 * brief inbox. One click, reflected system-wide — attention queue, graph,
 * agent panes, and the brief overlay all read the same state. Zero credits.
 */
export interface TriageTarget {
  itemId?: number;
  source?: string;
  ref?: string;
}

interface Props {
  target: TriageTarget;
  /** Called after a successful triage so the parent can remove/refresh the row. */
  onDone?: (action: 'sorted' | 'deferred') => void;
  size?: 'xs' | 'sm';
  /** Stop row-level onClick (e.g. inspect drawers) from firing. */
  stopPropagation?: boolean;
}

async function send(target: TriageTarget, action: 'sorted' | 'deferred', defer?: DeferChoice) {
  if (target.itemId != null) {
    await triageItemRemote(target.itemId, action, defer);
  } else if (target.source && target.ref) {
    await triageRefRemote(target.source, target.ref, action, defer);
  } else {
    throw new Error('triage target missing');
  }
}

export default function TriageActions({ target, onDone, size = 'xs', stopPropagation = true }: Props) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const doSorted = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await send(target, 'sorted');
      onDone?.('sorted');
    } catch {
      /* row stays; user can retry */
    } finally {
      setBusy(false);
    }
  };

  const doDefer = async (e: React.MouseEvent, choice: DeferChoice) => {
    if (stopPropagation) e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setMenuOpen(false);
    try {
      await send(target, 'deferred', choice);
      onDone?.('deferred');
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  };

  const pad = size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-1';
  const icon = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1 shrink-0" onClick={(e) => stopPropagation && e.stopPropagation()}>
      <button
        onClick={doSorted}
        disabled={busy}
        title="Sorted — dealt with"
        className={`flex items-center gap-1 ${pad} rounded border border-solent-border text-solent-dim hover:text-solent-mint hover:border-solent-mint/40 hover:bg-solent-mint/5 transition-colors disabled:opacity-40 font-mono text-[9px] uppercase tracking-wider`}
      >
        <Check className={icon} /> Sorted
      </button>
      <button
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        disabled={busy}
        title="Defer — come back to this later"
        className={`flex items-center gap-0.5 ${pad} rounded border border-solent-border text-solent-dim hover:text-solent-orange hover:border-solent-orange/40 hover:bg-solent-orange/5 transition-colors disabled:opacity-40 font-mono text-[9px] uppercase tracking-wider`}
      >
        <Clock className={icon} /> Defer <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-[80] min-w-[130px] rounded-lg border border-solent-border bg-solent-surface-2 shadow-xl overflow-hidden">
          {DEFER_CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={(e) => doDefer(e, c.id)}
              className="w-full text-left px-3 py-1.5 text-[10px] text-solent-muted hover:text-solent-orange hover:bg-solent-surface-3 transition-colors font-mono"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
