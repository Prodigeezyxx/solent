import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, AtSign, Check, Loader2, MessageSquare, RefreshCcw, User, X } from 'lucide-react';
import { fetchItemContext, markSeen, resolveItemId, type InboxItem, type ItemContext } from '../lib/api';

/**
 * ITEM CONTEXT DRAWER — click any inbox/attention item and see EVERYTHING
 * the system knows: the full message, who the person is, your recent history
 * with them, why it was flagged, and any open loops with that person.
 * All zero-credit D1 reads.
 */

interface Props {
  item: InboxItem | null;
  onClose: () => void;
  onDraft: (text: string) => void;
  onHandled?: () => void;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ItemContextDrawer({ item, onClose, onDraft, onHandled }: Props) {
  const [ctx, setCtx] = useState<ItemContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    setCtx(null);
    setHandled(false);
    if (!item) return;
    setLoading(true);
    (async () => {
      try {
        const id = await resolveItemId(item.source, item.ref);
        if (id != null) setCtx(await fetchItemContext(id));
      } catch {
        /* durable row may not exist yet */
      } finally {
        setLoading(false);
      }
    })();
  }, [item]);

  const markHandled = async () => {
    if (!ctx) return;
    setHandled(true);
    try { await markSeen(ctx.item.id); onHandled?.(); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[121] w-full max-w-md bg-solent-surface border-l border-solent-border shadow-2xl overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-solent-border/60 bg-solent-surface">
              <span className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-solent-dim uppercase">
                <MessageSquare className="w-3.5 h-3.5" /> Item context
              </span>
              <button onClick={onClose} className="text-solent-dim hover:text-solent-text" aria-label="Close context">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* The message itself */}
              <section>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <strong className="text-sm font-semibold text-solent-text">{item.from}</strong>
                  {item.channel && <span className="px-1.5 py-0.5 rounded bg-solent-border/60 text-[9px] font-mono text-solent-dim">{item.channel}</span>}
                  {item.mentionsMe ? <span className="flex items-center gap-0.5 text-[9px] font-mono text-solent-blue"><AtSign className="w-2.5 h-2.5" />you</span> : null}
                  <span className="text-[9px] font-mono text-solent-dim ml-auto">{fmtTs(item.ts)}</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed rounded-lg border border-solent-border/60 bg-black/20 p-3">{item.text}</p>
                {item.needsAttention && (
                  <p className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-solent-orange">
                    <AlertTriangle className="w-3 h-3" /> flagged: {item.attentionReason ?? 'needs you'}
                  </p>
                )}
              </section>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onDraft(`Draft a reply to this ${item.source} message from ${item.from} (${item.channel ?? ''}): "${item.text}"`); onClose(); }}
                  className="flex-1 h-8 rounded-md bg-solent-mint text-solent-bg text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Draft reply with CONDUCTOR
                </button>
                <button
                  onClick={markHandled}
                  disabled={!ctx || handled}
                  className={`h-8 px-3 rounded-md border text-xs font-semibold transition-colors ${handled ? 'border-solent-mint/40 text-solent-mint' : 'border-solent-border text-solent-dim hover:text-solent-text'} disabled:opacity-60`}
                >
                  {handled ? <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> handled</span> : 'Mark handled'}
                </button>
              </div>

              {loading && (
                <p className="flex items-center justify-center gap-2 py-6 text-[10px] font-mono text-solent-dim">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> assembling context…
                </p>
              )}

              {/* Person card */}
              {ctx?.person && (
                <section className="rounded-lg border border-solent-border/60 overflow-hidden">
                  <div className="px-3 py-2 bg-black/20 border-b border-solent-border/50 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-solent-dim">
                    <User className="w-3 h-3" /> Who this is
                  </div>
                  <div className="p-3">
                    <strong className="block text-xs font-semibold text-zinc-200">{ctx.person.name}{ctx.person.vip ? <span className="ml-1.5 text-[9px] font-mono text-solent-orange">VIP</span> : null}</strong>
                    {ctx.person.title && <small className="block text-[10px] text-solent-muted mt-0.5">{ctx.person.title}</small>}
                    {ctx.person.email && <small className="block text-[10px] font-mono text-solent-dim mt-0.5">{ctx.person.email}</small>}
                  </div>
                </section>
              )}

              {/* Open loops with this person */}
              {ctx && ctx.loops.length > 0 && (
                <section className="rounded-lg border border-solent-orange/25 overflow-hidden">
                  <div className="px-3 py-2 bg-solent-orange/[.05] border-b border-solent-orange/20 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-solent-orange">
                    <RefreshCcw className="w-3 h-3" /> Open loops with {item.from}
                  </div>
                  {ctx.loops.map((l) => (
                    <div key={l.id} className="px-3 py-2 border-b border-solent-border/30 last:border-0">
                      <span className="text-[9px] font-mono text-solent-dim uppercase">{l.direction === 'inbound' ? 'you owe them' : 'you await them'}</span>
                      <p className="text-[10px] text-solent-muted mt-0.5 line-clamp-2">{l.ask}</p>
                    </div>
                  ))}
                </section>
              )}

              {/* Recent history with this person */}
              {ctx && ctx.history.length > 0 && (
                <section className="rounded-lg border border-solent-border/60 overflow-hidden">
                  <div className="px-3 py-2 bg-black/20 border-b border-solent-border/50 text-[9px] font-mono uppercase tracking-widest text-solent-dim">
                    Recent from {item.from}
                  </div>
                  {ctx.history.map((h) => (
                    <div key={h.id} className="px-3 py-2 border-b border-solent-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        {h.channel && <span className="text-[9px] font-mono text-solent-dim">{h.channel}</span>}
                        {h.needs_attention ? <span className="text-[9px] font-mono text-solent-orange">⚠ {h.attention_reason}</span> : null}
                        <span className="text-[9px] font-mono text-solent-dim ml-auto">{fmtTs(h.ts)}</span>
                      </div>
                      <p className="text-[10px] text-solent-muted mt-0.5 line-clamp-2">{h.text}</p>
                    </div>
                  ))}
                </section>
              )}

              {!loading && ctx && !ctx.person && ctx.history.length === 0 && ctx.loops.length === 0 && (
                <p className="text-[10px] text-solent-dim text-center py-4">No further history with {item.from} yet — this builds up pass by pass.</p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
