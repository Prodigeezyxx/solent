import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, ChevronRight, Loader2, MessageSquare, Plus, RefreshCw, Send, Star, Trash2, X,
} from 'lucide-react';
import type { Agent } from '../types';
import {
  addDecisionRemote, addMemoryRemote, createTaskRemote, deleteTaskRemote, fetchAgentPane,
  saveDocRemote, streamChat, toggleTaskRemote, toggleVip,
  type AgentPane as PaneData, type PaneItem, type PaneSection,
} from '../lib/api';
import TriageActions from './TriageActions';

/**
 * Agent workspace — every council member is a full feature surface.
 * The pane's data is a zero-credit D1 read; the embedded chat talks directly
 * to THAT specialist (its own voice + the shared tool belt), one model call
 * per message.
 */

interface ChatLine { role: 'user' | 'agent'; content: string }

export default function AgentPane({ agent, onClose, onToast }: { agent: Agent; onClose: () => void; onToast: (t: string) => void }) {
  const [pane, setPane] = useState<PaneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPane(await fetchAgentPane(agent.id));
    } catch {
      setPane(null);
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => { load(); setChat([]); }, [load]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, thinking]);

  const sendToAgent = (text: string) => {
    if (!text.trim() || thinking) return;
    const history = [...chat, { role: 'user' as const, content: text }];
    setChat(history);
    setInput('');
    setThinking(true);
    streamChat(
      history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', agent: m.role === 'agent' ? agent.id : undefined, content: m.content })),
      {
        onTool: (t) => { onToast(`${t.agent} · ${t.action}`); },
        onReply: ({ content }) => setChat((prev) => [...prev, { role: 'agent', content }]),
        onDone: () => { setThinking(false); load(); },
        onError: (e) => {
          setThinking(false);
          setChat((prev) => [...prev, { role: 'agent', content: `Unreachable: ${e.message}` }]);
        },
      },
      agent.id,
    );
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-solent-border/50">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg grid place-items-center font-mono text-sm font-bold shrink-0"
            style={{ backgroundColor: `${agent.color}1a`, color: agent.color, border: `1px solid ${agent.color}55` }}
          >
            {agent.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight" style={{ color: agent.color }}>{agent.name}</h1>
            <p className="text-[11px] text-solent-dim">{agent.job}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-md border border-solent-border text-solent-dim hover:text-solent-mint transition-colors" aria-label="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-md border border-solent-border text-solent-dim hover:text-solent-text transition-colors" aria-label="Back to command centre">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Workspace */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {loading && <div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 text-solent-mint animate-spin" /></div>}

          {!loading && pane && (
            <>
              <div className="mb-5 rounded-xl border p-4 text-sm leading-relaxed text-zinc-300" style={{ borderColor: `${agent.color}30`, backgroundColor: `${agent.color}08` }}>
                <span className="block text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: agent.color }}>{agent.name} · status</span>
                {pane.headline}
              </div>

              {pane.stats.length > 0 && (
                <div className="grid gap-px rounded-xl border border-solent-border bg-solent-border overflow-hidden mb-5" style={{ gridTemplateColumns: `repeat(${Math.min(pane.stats.length, 5)}, minmax(0,1fr))` }}>
                  {pane.stats.map((s, i) => (
                    <div key={i} className="bg-solent-surface p-3">
                      <div className="text-lg font-semibold text-solent-text">{s.value}</div>
                      <div className="text-[10px] text-solent-dim mt-0.5">{s.label}</div>
                      {s.hint && <div className="text-[9px] font-mono text-solent-dim/70 mt-0.5">{s.hint}</div>}
                    </div>
                  ))}
                </div>
              )}

              {pane.sections.map((sec) => (
                <Section key={sec.key} section={sec} agent={agent} onChanged={load} onToast={onToast} />
              ))}

              {pane.actions.includes('add_task') && <AddTaskForm agent={agent} onAdded={() => { load(); onToast('Task added'); }} />}
              {pane.actions.includes('add_memory') && <AddSimpleForm placeholder="Log an insight worth remembering…" cta="Log memory" onSubmit={async (v) => { await addMemoryRemote(v, agent.id); load(); onToast('Memory logged'); }} />}
              {pane.actions.includes('add_note') && <AddSimpleForm placeholder="Private note (only GHOST sees this)…" cta="Save note" onSubmit={async (v) => { await addMemoryRemote(v, 'GHOST'); load(); onToast('Note saved'); }} />}
              {pane.actions.includes('add_decision') && <AddDecisionForm onAdded={() => { load(); onToast('Decision logged'); }} />}
              {pane.actions.includes('add_doc') && <AddDocForm onAdded={() => { load(); onToast('Doc added to library'); }} />}
            </>
          )}

          {!loading && !pane && <p className="text-solent-dim text-sm">Could not load {agent.name}'s workspace — is the Worker running?</p>}
        </div>

        {/* Agent-direct chat */}
        <div className="lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-solent-border/50 flex flex-col min-h-[280px] lg:min-h-0">
          <div className="px-4 py-2.5 border-b border-solent-border/50 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" style={{ color: agent.color }} />
            <span className="text-[10px] font-mono uppercase tracking-widest text-solent-dim">Direct line to {agent.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chat.length === 0 && (
              <p className="text-[11px] text-solent-dim leading-relaxed">{pane?.chat_hint ?? `Talk to ${agent.name} directly — one model call per message.`}</p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`text-xs leading-relaxed ${m.role === 'user' ? 'text-zinc-300 bg-solent-border/30 rounded-lg px-3 py-2' : 'text-zinc-200'}`}>
                {m.role === 'agent' && <span className="block text-[9px] font-mono tracking-widest mb-1" style={{ color: agent.color }}>{agent.name}</span>}
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
            {thinking && <div className="flex items-center gap-2 text-[10px] font-mono text-solent-dim"><Loader2 className="w-3 h-3 animate-spin" style={{ color: agent.color }} /> {agent.name} working…</div>}
            <div ref={chatEndRef} />
          </div>
          <form
            className="p-3 border-t border-solent-border/50 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); sendToAgent(input); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${agent.name}…`}
              className="flex-1 bg-solent-border/20 border border-solent-border rounded-md px-3 py-2 text-xs text-zinc-100 placeholder:text-solent-dim outline-none focus:border-solent-mint/40"
            />
            <button type="submit" disabled={!input.trim() || thinking} className="p-2 rounded-md disabled:opacity-40 transition-opacity" style={{ color: agent.color }} aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---- Sections -----------------------------------------------------------------

function Section({ section, agent, onChanged, onToast }: { section: PaneSection; agent: Agent; onChanged: () => void; onToast: (t: string) => void }) {
  const [expanded, setExpanded] = useState<PaneItem | null>(null);
  return (
    <section className="mb-5 rounded-xl border border-solent-border bg-solent-surface/70 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-solent-border/50">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-solent-dim">{section.title}</h2>
      </div>
      {section.items.length === 0 && section.empty && (
        <p className="px-4 py-3 text-[11px] text-solent-dim">{section.empty}</p>
      )}
      {section.items.map((it) => (
        <SectionRow
          key={String(it.id)}
          item={it}
          kind={section.kind}
          expanded={expanded?.id === it.id}
          onExpand={() => setExpanded(expanded?.id === it.id ? null : it)}
          onChanged={onChanged}
          onToast={onToast}
          agentColor={agent.color}
        />
      ))}
    </section>
  );
}

function SectionRow({ item, kind, expanded, onExpand, onChanged, onToast, agentColor }: {
  item: PaneItem; kind: PaneSection['kind']; expanded: boolean; onExpand: () => void;
  onChanged: () => void; onToast: (t: string) => void; agentColor: string;
}) {
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onToast(msg); onChanged(); } catch { onToast('Action failed'); } finally { setBusy(false); }
  };

  if (gone) return null;

  return (
    <div className="border-b border-solent-border/30 last:border-0">
      <div className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[.02] transition-colors">
        {kind === 'tasks' && (
          <button
            disabled={busy}
            onClick={() => act(() => toggleTaskRemote(Number(item.id)), item.done ? 'Reopened' : 'Done ✓')}
            className={`mt-0.5 w-4 h-4 grid place-items-center rounded border shrink-0 ${item.done ? 'border-solent-mint bg-solent-mint/10 text-solent-mint' : 'border-solent-border text-transparent hover:border-solent-mint/50'}`}
            aria-label="Toggle done"
          >
            <Check className="w-3 h-3" />
          </button>
        )}
        {kind === 'people' && (
          <button
            disabled={busy}
            onClick={() => act(() => toggleVip(Number(item.id)), item.flag ? 'VIP removed' : 'Marked VIP ★')}
            className={`mt-0.5 shrink-0 ${item.flag ? 'text-solent-orange' : 'text-solent-dim hover:text-solent-orange'}`}
            aria-label="Toggle VIP"
          >
            <Star className="w-3.5 h-3.5" fill={item.flag ? 'currentColor' : 'none'} />
          </button>
        )}
        <button className="flex-1 min-w-0 text-left" onClick={onExpand}>
          <span className={`block text-xs ${item.done ? 'line-through text-solent-muted' : 'text-zinc-300'} ${item.flag && kind !== 'people' ? 'font-medium' : ''}`}>
            {item.title}
          </span>
          {item.detail && (
            <span className={`block text-[10px] text-solent-muted mt-0.5 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>{item.detail}</span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {item.meta && <span className="text-[9px] font-mono text-solent-dim">{item.meta}</span>}
          {item.triage && !gone && (
            <TriageActions
              target={{ itemId: Number(item.id) }}
              onDone={(a) => { setGone(true); onToast(a === 'sorted' ? 'Sorted ✓ — reflected everywhere' : 'Deferred ⏰'); onChanged(); }}
            />
          )}
          {kind === 'usage' && item.detail && <span className="text-[10px] font-mono" style={{ color: agentColor }}>{expanded ? '' : item.detail}</span>}
          {kind === 'tasks' && (
            <button
              disabled={busy}
              onClick={() => act(() => deleteTaskRemote(Number(item.id)), 'Task removed')}
              className="text-solent-dim/50 hover:text-red-400 transition-colors"
              aria-label="Delete task"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {(kind === 'list' || kind === 'drafts') && item.detail && (
            <ChevronRight className={`w-3 h-3 text-solent-dim transition-transform ${expanded ? 'rotate-90' : ''}`} />
          )}
        </div>
      </div>
      {expanded && kind === 'drafts' && item.detail && (
        <div className="px-4 pb-3">
          <button
            onClick={() => { navigator.clipboard?.writeText(item.detail!); onToast('Draft copied to clipboard'); }}
            className="text-[10px] font-mono px-2 py-1 rounded border border-solent-border text-solent-dim hover:text-solent-mint transition-colors"
          >
            copy draft
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Add forms ------------------------------------------------------------------

function AddTaskForm({ agent, onAdded }: { agent: Agent; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await createTaskRemote(title.trim(), `manual · ${agent.id}`); setTitle(''); onAdded(); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-dashed border-solent-border p-3 mb-5">
      <Plus className="w-4 h-4 text-solent-dim shrink-0" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task to the queue…"
        className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-solent-dim outline-none"
      />
      <button type="submit" disabled={!title.trim() || busy} className="text-[10px] font-mono px-2.5 py-1.5 rounded-md bg-solent-mint text-solent-bg font-semibold disabled:opacity-40">
        Add
      </button>
    </form>
  );
}

function AddSimpleForm({ placeholder, cta, onSubmit }: { placeholder: string; cta: string; onSubmit: (v: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (!value.trim() || busy) return; setBusy(true); try { await onSubmit(value.trim()); setValue(''); } finally { setBusy(false); } }}
      className="rounded-xl border border-dashed border-solent-border p-3 mb-5"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-solent-dim outline-none resize-none mb-2"
      />
      <button type="submit" disabled={!value.trim() || busy} className="text-[10px] font-mono px-2.5 py-1.5 rounded-md bg-solent-mint text-solent-bg font-semibold disabled:opacity-40">
        {cta}
      </button>
    </form>
  );
}

function AddDecisionForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (!title.trim() || busy) return; setBusy(true); try { await addDecisionRemote(title.trim(), rationale.trim()); setTitle(''); setRationale(''); onAdded(); } finally { setBusy(false); } }}
      className="rounded-xl border border-dashed border-solent-border p-3 mb-5 space-y-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The decision, in one line…" className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-solent-dim outline-none" />
      <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why — and how you'll know it worked…" rows={2} className="w-full bg-transparent text-[11px] text-zinc-300 placeholder:text-solent-dim outline-none resize-none" />
      <button type="submit" disabled={!title.trim() || busy} className="text-[10px] font-mono px-2.5 py-1.5 rounded-md bg-solent-mint text-solent-bg font-semibold disabled:opacity-40">
        Log decision
      </button>
    </form>
  );
}

function AddDocForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (!title.trim() || !content.trim() || busy) return; setBusy(true); try { await saveDocRemote(title.trim(), content); setTitle(''); setContent(''); onAdded(); } finally { setBusy(false); } }}
      className="rounded-xl border border-dashed border-solent-border p-3 mb-5 space-y-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title…" className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-solent-dim outline-none" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the content — future briefs treat it as ground truth…" rows={4} className="w-full bg-transparent text-[11px] text-zinc-300 placeholder:text-solent-dim outline-none resize-none" />
      <button type="submit" disabled={!title.trim() || !content.trim() || busy} className="text-[10px] font-mono px-2.5 py-1.5 rounded-md bg-solent-mint text-solent-bg font-semibold disabled:opacity-40">
        Add to library
      </button>
    </form>
  );
}
