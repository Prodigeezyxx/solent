import { useEffect, useState } from 'react';
import { History, Pin, Loader2, Trash2, PenLine, RotateCcw } from 'lucide-react';
import {
  deleteSnapshotRemote, fetchSnapshot, fetchSnapshots, labelSnapshotRemote, pinSnapshotRemote,
  type Brief, type SnapshotMeta,
} from '../lib/api';

/**
 * TIMEBLOCKS — saved brief states.
 *
 * Every LLM pass auto-saves the full brief server-side, so pulling new
 * context never destroys the summary the operator was still exploring.
 * This shelf lists previous states: restore any one to view it (the live
 * brief keeps refreshing underneath), pin the important ones so they
 * survive pruning, and label them in your own words.
 */
export default function Timeblocks({
  refreshKey, currentGeneratedAt, onRestore, onToast,
}: {
  refreshKey: number | string;
  /** generated_at of the brief currently on screen — marked "viewing". */
  currentGeneratedAt?: number;
  onRestore: (brief: Brief, meta: SnapshotMeta) => void;
  onToast: (msg: string) => void;
}) {
  const [items, setItems] = useState<SnapshotMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [labelingId, setLabelingId] = useState<number | null>(null);
  const [labelText, setLabelText] = useState('');

  const load = () => { fetchSnapshots().then(setItems).catch(() => {}); };
  useEffect(load, [refreshKey]);

  if (items.length === 0) return null;

  const restore = async (id: number) => {
    setBusyId(id);
    try {
      const { brief, meta } = await fetchSnapshot(id);
      onRestore({ ...brief, cached: true }, meta);
      onToast(`Timeblock restored · ${new Date(meta.generated_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      onToast('Could not restore that timeblock');
    } finally {
      setBusyId(null);
    }
  };

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="mb-4 rounded-xl border border-solent-border bg-solent-surface/70 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full min-h-[44px] px-4 py-2.5 flex items-center gap-2 text-left hover:bg-white/[.02] transition-colors">
        <History className="w-3.5 h-3.5 text-solent-blue" />
        <span className="text-xs font-semibold text-zinc-300">Timeblocks</span>
        <span className="px-1.5 py-0.5 rounded bg-solent-blue/10 text-[9px] font-mono text-solent-blue">{items.length} saved states</span>
        <span className="hidden sm:inline text-[9px] text-solent-dim">every pass is preserved — restore any previous brief</span>
        <span className="ml-auto text-[9px] font-mono text-solent-dim">{open ? 'hide ▴' : 'show ▾'}</span>
      </button>
      {open && items.map((s) => {
        const viewing = currentGeneratedAt === s.generated_at;
        return (
          <div key={s.id} className={`flex items-start gap-3 px-4 py-2.5 border-t border-solent-border/30 ${viewing ? 'bg-solent-blue/[.05]' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <strong className="text-[11px] text-zinc-300">{s.label || s.headline || 'Untitled pass'}</strong>
                {s.pinned ? <Pin className="w-3 h-3 text-solent-mint" /> : null}
                {viewing && <span className="px-1.5 py-0.5 rounded bg-solent-blue/15 text-[8px] font-mono uppercase text-solent-blue">viewing</span>}
              </span>
              <span className="block text-[10px] text-solent-muted line-clamp-1 mt-0.5">{s.label ? s.headline : s.summary}</span>
              <span className="block text-[9px] font-mono text-solent-dim mt-0.5">
                {fmtTime(s.generated_at)} · {s.priorities_count} priorities · {s.replies_count} drafts · {s.needs_attention} flagged
              </span>
              {labelingId === s.id && (
                <form
                  className="mt-1.5 flex items-center gap-1.5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try { await labelSnapshotRemote(s.id, labelText.trim()); setLabelingId(null); load(); } catch { onToast('Label failed'); }
                  }}
                >
                  <input
                    autoFocus
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setLabelingId(null); }}
                    placeholder="Name this timeblock…"
                    className="flex-1 bg-solent-bg border border-solent-border rounded px-2 py-1 text-[10px] text-zinc-100 outline-none focus:border-solent-mint/50"
                  />
                  <button type="submit" className="text-[9px] font-mono px-2 py-1 rounded bg-solent-mint text-solent-bg font-semibold">save</button>
                </form>
              )}
            </span>
            <span className="flex items-center gap-1 shrink-0 mt-0.5">
              <button
                onClick={() => restore(s.id)}
                disabled={busyId === s.id || viewing}
                title="Restore this state (the live brief keeps updating underneath)"
                className="flex items-center gap-1 min-h-[32px] px-2 py-1 rounded border border-solent-border text-[9px] font-mono text-solent-dim hover:text-solent-blue hover:border-solent-blue/40 disabled:opacity-40 transition-colors"
              >
                {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} restore
              </button>
              <button
                onClick={async () => { try { await pinSnapshotRemote(s.id); load(); } catch { /* ignore */ } }}
                title={s.pinned ? 'Unpin' : 'Pin — pinned states are kept forever'}
                className={`min-h-[32px] px-1.5 py-1 rounded border transition-colors ${s.pinned ? 'border-solent-mint/40 text-solent-mint' : 'border-solent-border text-solent-dim hover:text-solent-mint'}`}
              >
                <Pin className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setLabelingId(labelingId === s.id ? null : s.id); setLabelText(s.label ?? ''); }}
                title="Label this timeblock"
                className="min-h-[32px] px-1.5 py-1 rounded border border-solent-border text-solent-dim hover:text-solent-text transition-colors"
              >
                <PenLine className="w-3 h-3" />
              </button>
              <button
                onClick={async () => { try { await deleteSnapshotRemote(s.id); load(); } catch { /* ignore */ } }}
                title="Delete this saved state"
                className="min-h-[32px] px-1.5 py-1 rounded border border-solent-border text-solent-dim hover:text-solent-red transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          </div>
        );
      })}
    </section>
  );
}
