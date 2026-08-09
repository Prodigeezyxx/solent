import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  Mic, MicOff, Terminal, ChevronRight, Hash, Send, Target, Clock3, Radio, Gauge,
  Check, CheckCircle2, Circle, Activity, TrendingUp, CalendarDays, Plus, ArrowRight, History,
  Sparkles, Inbox, Users, Loader2, Plug, RefreshCw, Mail, MessageSquare, PenLine, AlertTriangle, AtSign, X,
} from 'lucide-react';
import type { Mode, Task, Message } from '../types';
import {
  fetchTriageOverlay, deferTaskRemote, fetchDeferredItems, triageItemRemote,
  type Brief, type InboxItem, type DeferChoice, type DeferredItem, type SnapshotMeta,
} from '../lib/api';
import { useVoiceInput } from '../hooks/useVoiceInput';
import KnowledgeGraph from './KnowledgeGraph';
import OpenLoops from './OpenLoops';
import ItemContextDrawer from './ItemContextDrawer';
import TriageActions from './TriageActions';
import Timeblocks from './Timeblocks';

/**
 * Universal triage overlay — rows from the cached brief that were marked
 * sorted/deferred anywhere in the app disappear here too. One D1 state,
 * reflected system-wide. Zero credits.
 */
function useTriageOverlay(briefKey: number | string | undefined) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    fetchTriageOverlay()
      .then((d) => {
        if (!alive) return;
        const s = new Set<string>();
        for (const [key, v] of Object.entries(d.overlay)) {
          if (v.status === 'sorted' || v.status === 'deferred') s.add(key);
        }
        setHidden(s);
      })
      .catch(() => { /* overlay is best-effort */ });
    return () => { alive = false; };
  }, [briefKey]);
  const hide = (source: string, ref: string) => setHidden((prev) => new Set(prev).add(`${source}:${ref}`));
  return { hidden, hide };
}

interface CenterStageProps {
  mode: Mode;
  tasks: Task[];
  onToggleTask: (id: number) => void;
  onAddTask: (title: string) => void;
  messages: Message[];
  onSend: (text: string) => void;
  onOpenPalette: () => void;
  onToggleContext: () => void;
  streaming?: boolean;
  brief: Brief | null;
  briefRunning: boolean;
  onRunBrief: () => void;
  onOpenSources: () => void;
  onSetMode: (m: Mode) => void;
  /** Non-null when the operator is viewing a restored timeblock (saved state). */
  snapshotMeta: SnapshotMeta | null;
  onRestoreSnapshot: (brief: Brief, meta: SnapshotMeta) => void;
  onExitSnapshot: () => void;
  onToast: (msg: string) => void;
}

const FOCUS_SECONDS = 50 * 60;

export default function CenterStage({
  mode, tasks, onToggleTask, onAddTask, messages, onSend, onOpenPalette, onToggleContext, streaming,
  brief, briefRunning, onRunBrief, onOpenSources, onSetMode,
  snapshotMeta, onRestoreSnapshot, onExitSnapshot, onToast,
}: CenterStageProps) {
  const [input, setInput] = useState('');
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(FOCUS_SECONDS);
  const [contextItem, setContextItem] = useState<InboxItem | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const completed = tasks.filter((t) => t.done).length;

  useEffect(() => {
    if (!focusRunning || focusSeconds <= 0) return;
    const timer = window.setInterval(() => setFocusSeconds((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning, focusSeconds]);

  useEffect(() => {
    if (mode === 'DEEP') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const focusTime = `${Math.floor(focusSeconds / 60).toString().padStart(2, '0')}:${(focusSeconds % 60).toString().padStart(2, '0')}`;

  const showChat = mode === 'DEEP';

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-solent-bg relative">
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-100" />

      <div className="relative flex-1 overflow-y-auto">
        {/* TIMEBLOCK BANNER — you're viewing a saved state; the live brief keeps
            polling underneath and one tap returns you to it. */}
        {snapshotMeta && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2 bg-solent-blue/10 border-b border-solent-blue/30 backdrop-blur-md">
            <History className="w-3.5 h-3.5 text-solent-blue shrink-0" />
            <span className="text-[11px] text-zinc-200 min-w-0 truncate">
              Viewing saved state · <strong>{snapshotMeta.label || snapshotMeta.headline || 'untitled'}</strong>
              <span className="text-solent-dim font-mono text-[10px]"> · {new Date(snapshotMeta.generated_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <button
              onClick={onExitSnapshot}
              className="ml-auto shrink-0 flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded border border-solent-blue/40 text-[10px] font-mono text-solent-blue hover:bg-solent-blue/10 transition-colors"
            >
              <X className="w-3 h-3" /> back to live
            </button>
          </div>
        )}
        {mode === 'COMMAND' && (
          <Dashboard
            completed={completed}
            tasks={tasks}
            onToggleTask={onToggleTask}
            onAddTask={onAddTask}
            onOpenPalette={onOpenPalette}
            onToggleContext={onToggleContext}
            brief={brief}
            briefRunning={briefRunning}
            onRunBrief={onRunBrief}
            onOpenSources={onOpenSources}
            onSend={onSend}
            onInspect={setContextItem}
            onSetMode={onSetMode}
            snapshotMeta={snapshotMeta}
            onRestoreSnapshot={onRestoreSnapshot}
            onToast={onToast}
          />
        )}

        {mode === 'RECEIVE' && (
          <ReceiveView brief={brief} briefRunning={briefRunning} onRunBrief={onRunBrief} onOpenSources={onOpenSources} onSend={onSend} onInspect={setContextItem} />
        )}

        {mode === 'FOCUS' && (
          <FocusView
            focusTime={focusTime}
            running={focusRunning}
            onToggle={() => setFocusRunning((r) => !r)}
            onReset={() => { setFocusSeconds(FOCUS_SECONDS); setFocusRunning(false); }}
            target={tasks.find((t) => !t.done)?.title}
          />
        )}

        {mode === 'PERFORMANCE' && <PerformanceView completed={completed} tasks={tasks} />}

        {mode === 'GRAPH' && <KnowledgeGraph onRunBrief={onRunBrief} briefRunning={briefRunning} />}

        <ItemContextDrawer item={contextItem} onClose={() => setContextItem(null)} onDraft={onSend} />

        {showChat && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`max-w-3xl mx-auto flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-mono tracking-widest uppercase ${msg.sender === 'USER' ? 'text-solent-dim' : 'text-solent-mint'}`}>
                      {msg.sender}
                    </span>
                    <span className="text-[10px] font-mono text-solent-dim">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`text-sm md:text-base leading-relaxed ${msg.sender === 'USER' ? 'text-zinc-300 bg-solent-border/30 px-4 py-3 rounded-lg border border-solent-border/50' : 'text-zinc-200'}`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onOpenPalette={onOpenPalette}
        chatMode={showChat}
        streaming={streaming}
        onToast={onToast}
      />
    </div>
  );
}

function Composer({
  value, onChange, onSubmit, onOpenPalette, chatMode, streaming, onToast,
}: {
  value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void;
  onOpenPalette: () => void; chatMode: boolean; streaming?: boolean; onToast: (msg: string) => void;
}) {
  // VOICE INPUT (skeleton) — Web Speech API. Tap the mic, speak, transcript
  // streams into the command bar; unsupported browsers get a graceful notice.
  const { supported, listening, toggle } = useVoiceInput({
    onTranscript: (text) => onChange(text),
    onError: (msg) => onToast(msg),
  });
  return (
    <div className="relative z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-8 bg-gradient-to-t from-solent-bg via-solent-bg to-transparent">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={onSubmit}
          className={`relative bg-solent-surface/80 border rounded-lg shadow-2xl backdrop-blur-xl group focus-within:border-solent-mint/50 transition-colors ${listening ? 'border-solent-red/60' : 'border-solent-border'}`}
        >
          <div className="flex items-center px-3 md:px-4 py-3">
            <ChevronRight className="w-5 h-5 text-solent-mint mr-2 shrink-0" />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={listening ? 'Listening… speak now' : chatMode ? 'Command CONDUCTOR, or tap the mic to dictate…' : 'Capture a thought or ask CONDUCTOR…'}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-zinc-100 placeholder:text-solent-dim font-sans text-sm md:text-base"
            />
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <button
                type="button"
                onClick={toggle}
                aria-label={listening ? 'Stop dictation' : 'Start voice input'}
                aria-pressed={listening}
                title={supported ? (listening ? 'Stop dictation' : 'Dictate with your voice') : 'Voice input not supported in this browser yet'}
                className={`min-w-[40px] min-h-[40px] grid place-items-center transition-colors rounded-md ${
                  listening
                    ? 'text-solent-red bg-solent-red/10 animate-pulse'
                    : supported
                      ? 'text-solent-dim hover:text-solent-mint hover:bg-solent-border/50'
                      : 'text-solent-faint'
                }`}
              >
                {supported ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button type="button" onClick={onOpenPalette} className="min-w-[40px] min-h-[40px] grid place-items-center text-solent-dim hover:text-solent-text transition-colors rounded-md hover:bg-solent-border/50" aria-label="Commands">
                <Hash className="w-4 h-4" />
              </button>
              <button type="submit" disabled={!value.trim()} className="min-w-[40px] min-h-[40px] grid place-items-center text-solent-mint disabled:text-solent-dim disabled:opacity-50 transition-colors rounded-md hover:bg-solent-mint/10" aria-label="Send">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-solent-border/50 flex items-center justify-between text-[10px] font-mono text-solent-dim bg-black/20 rounded-b-lg">
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline"><kbd className="bg-solent-border px-1 rounded">⌘K</kbd> Palette</span>
              <span className={listening ? 'text-solent-red' : ''}>{listening ? '● recording' : supported ? '🎙 Mic ready' : 'voice n/a'}</span>
              <span className="hidden sm:inline"><kbd className="bg-solent-border px-1 rounded">/</kbd> Commands</span>
            </div>
            <div className="flex items-center gap-2 text-solent-mint/70">
              <Terminal className="w-3 h-3" />
              <span>{streaming ? 'CONDUCTOR thinking…' : 'SOLENT v0.2'}</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Chronology-safe ts — handles ISO strings AND Gmail's RFC-2822 Date headers. */
const tsValue = (ts?: string) => {
  const v = Date.parse(ts ?? '');
  return Number.isFinite(v) ? v : 0;
};

const SOURCE_ICON: Record<string, React.ReactNode> = {
  pumble: <MessageSquare className="w-3 h-3" />,
  gmail: <Mail className="w-3 h-3" />,
  zoho: <Mail className="w-3 h-3" />,
  gcal: <CalendarDays className="w-3 h-3" />,
};

const SOURCE_TONE: Record<string, string> = {
  pumble: 'text-solent-purple bg-solent-purple/10',
  gmail: 'text-solent-orange bg-solent-orange/10',
  zoho: 'text-solent-blue bg-solent-blue/10',
  gcal: 'text-solent-mint bg-solent-mint/10',
};

function SourceChips({ brief, onOpenSources }: { brief: Brief | null; onOpenSources: () => void }) {
  const sources = brief?.sources ?? [
    { source: 'pumble', configured: false, ok: false, count: 0 },
    { source: 'gmail', configured: false, ok: false, count: 0 },
    { source: 'zoho', configured: false, ok: false, count: 0 },
    { source: 'gcal', configured: false, ok: false, count: 0 },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {sources.map((s) => {
        // COVERAGE LEDGER surfaced: a capped source shows its gap right in the
        // chip's tooltip — "available > fetched" can never be a silent fact.
        const cov = s.coverage;
        const covLine = cov ? `\nCoverage: ${cov.note ?? `${cov.fetched} fetched${cov.available != null ? ` of ~${cov.available}` : ''}`}` : '';
        const title = s.error ?? (s.ok ? `${s.count} items${covLine}` : s.configured ? 'configured, no data yet' : 'not connected');
        return (
          <button
            key={s.source}
            onClick={onOpenSources}
            title={title}
            className={`flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider rounded-full border px-2 py-1 min-h-[24px] transition-colors ${
              s.ok
                ? 'border-solent-mint/40 text-solent-mint'
                : s.configured
                  ? 'border-solent-orange/40 text-solent-orange'
                  : 'border-solent-border text-solent-dim hover:text-solent-text'
            }`}
          >
            <i className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-solent-mint' : s.configured ? 'bg-solent-orange' : 'bg-solent-border'}`} />
            {s.source}
            {s.ok && (
              <span className="text-solent-dim">
                ·{s.count}
                {cov?.available != null && cov.available > cov.fetched ? <span className="text-solent-orange">/~{cov.available}</span> : null}
              </span>
            )}
            {s.ok && cov?.capped && cov.available == null ? <span className="text-solent-orange" title={cov.note}>▸</span> : null}
          </button>
        );
      })}
      <button onClick={onOpenSources} className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider rounded-full border border-solent-border px-2 py-1 min-h-[24px] text-solent-dim hover:text-solent-mint transition-colors">
        <Plug className="w-2.5 h-2.5" /> sources
      </button>
    </div>
  );
}

function Dashboard({
  completed, tasks, onToggleTask, onAddTask, onOpenPalette, onToggleContext, brief, briefRunning, onRunBrief, onOpenSources, onSend, onInspect, onSetMode,
  snapshotMeta, onRestoreSnapshot, onToast,
}: {
  completed: number; tasks: Task[]; onToggleTask: (id: number) => void; onAddTask: (title: string) => void;
  onOpenPalette: () => void; onToggleContext: () => void;
  brief: Brief | null; briefRunning: boolean; onRunBrief: () => void; onOpenSources: () => void;
  onSend: (text: string) => void; onInspect: (item: InboxItem) => void; onSetMode: (m: Mode) => void;
  snapshotMeta: SnapshotMeta | null; onRestoreSnapshot: (brief: Brief, meta: SnapshotMeta) => void; onToast: (msg: string) => void;
}) {
  const [showAttention, setShowAttention] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState('');
  const { hidden, hide } = useTriageOverlay(brief?.generated_at);
  const [deferredIds, setDeferredIds] = useState<Set<number>>(new Set());
  const attentionItems = (brief?.inbox ?? [])
    .filter((i) => i.needsAttention && !hidden.has(`${i.source}:${i.ref}`))
    .sort((a, b) => tsValue(b.ts) - tsValue(a.ts)); // newest flagged items on top
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const signals = brief?.signals ?? [];
  const connected = brief?.sources?.filter((s) => s.ok).length ?? 0;
  const inboxCount = brief?.inbox?.length ?? 0;
  const replyCount = brief?.replies?.length ?? 0;
  const needsYou = attentionItems.length;
  return (
    <div className="w-full max-w-5xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-end justify-between gap-6 mb-4 flex-wrap">
        <div>
          <p className="text-solent-dim font-mono text-[10px] tracking-widest mb-2">{today}</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-solent-text">{greeting}.</h1>
          <p className="text-solent-muted text-sm mt-2">
            {brief?.headline
              ? <strong className="text-zinc-300 font-medium">{brief.headline}</strong>
              : <>Run the one-shot pass to pull Pumble + Gmail + Zoho + Calendar and triage your day.</>}
          </p>
        </div>
        <button
          onClick={onRunBrief}
          disabled={briefRunning}
          className="flex items-center gap-2 border border-solent-border rounded-lg px-3 py-2 bg-solent-mint/5 hover:border-solent-mint/40 disabled:opacity-60 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-solent-mint text-xs font-semibold">
            {briefRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {briefRunning ? 'Running one-shot pass…' : 'Run brief'}
          </span>
          <small className="text-solent-dim text-[10px]">
            {brief ? `${brief.cached ? 'cached · ' : ''}${new Date(brief.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '1 model call'}
          </small>
          <ArrowRight className="w-4 h-4 text-solent-mint" />
        </button>
      </div>

      <div className="mb-6"><SourceChips brief={brief} onOpenSources={onOpenSources} /></div>

      {brief?.summary && (
        <div className="mb-4 rounded-xl border border-solent-mint/20 bg-solent-mint/[.04] p-4 text-sm text-zinc-300 leading-relaxed">
          <span className="block text-[9px] font-mono uppercase tracking-widest text-solent-mint mb-1.5">Conductor · executive summary</span>
          {brief.summary}
          {brief.error && <span className="block mt-2 text-[10px] text-solent-orange font-mono">⚠ {brief.error}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border border-solent-border bg-solent-border overflow-hidden mb-4">
        <button onClick={() => setShowAttention((v) => !v)} className="text-left cursor-pointer" title="Click to see what needs you, with context">
          <Metric icon={<AlertTriangle className="w-4 h-4" />} color={'solent-orange' as const} value={`${needsYou}`} label="Needs you" tag={needsYou ? (showAttention ? 'hide ▴' : 'show ▾') : 'clear'} />
        </button>
        <button onClick={() => onSetMode('RECEIVE')} className="text-left cursor-pointer" title="Open the unified inbox — every item from the last pass">
          <Metric icon={<Radio className="w-4 h-4" />} color={'solent-purple' as const} value={`${inboxCount}`} label="Items in last pass" tag={brief ? 'scanned →' : '—'} />
        </button>
        <button onClick={() => onSetMode('RECEIVE')} className="text-left cursor-pointer" title="Open RECEIVE — drafted replies are at the top">
          <Metric icon={<Clock3 className="w-4 h-4" />} color={'solent-blue' as const} value={`${replyCount}`} label="Replies drafted" tag={replyCount ? 'awaiting you →' : '—'} />
        </button>
        <button onClick={onOpenSources} className="text-left cursor-pointer" title="Open Sources — connection status & credentials">
          <Metric icon={<Gauge className="w-4 h-4" />} color={'solent-mint' as const} value={`${connected}`} sub="/4" label="Sources connected" tag={connected ? 'online →' : 'connect'} />
        </button>
      </div>

      {/* Expanded attention queue — every flagged item, clickable for full context.
          Every row carries universal triage: ✓ sorted or defer, reflected system-wide. */}
      {showAttention && attentionItems.length > 0 && (
        <section className="mb-4 rounded-xl border border-solent-orange/25 bg-solent-orange/[.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-solent-orange/20 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-solent-orange" />
            <h2 className="text-xs font-semibold text-zinc-200">Needs you — click any item for full context</h2>
          </div>
          {attentionItems.map((it, i) => (
            <div
              key={`${it.source}-${it.ref}-${i}`}
              onClick={() => onInspect(it)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onInspect(it); }}
              className="w-full flex items-start gap-3 px-4 py-2.5 border-b border-solent-border/30 last:border-0 text-left hover:bg-white/[.03] transition-colors cursor-pointer"
            >
              <span className={`mt-0.5 w-5 h-5 rounded grid place-items-center shrink-0 text-[9px] ${SOURCE_TONE[it.source]}`}>{SOURCE_ICON[it.source]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <strong className="text-[11px] font-medium text-zinc-300">{it.from}</strong>
                  {it.channel && <span className="px-1.5 py-0.5 rounded bg-solent-border/60 text-[9px] font-mono text-solent-dim">{it.channel}</span>}
                  <span className="text-[9px] font-mono text-solent-orange">{it.attentionReason}</span>
                </span>
                <span className="block text-[10px] text-solent-muted mt-0.5 line-clamp-1">{it.text}</span>
              </span>
              <TriageActions target={{ source: it.source, ref: it.ref }} onDone={() => hide(it.source, it.ref)} />
              <ChevronRight className="w-3.5 h-3.5 text-solent-dim shrink-0 mt-1" />
            </div>
          ))}
        </section>
      )}

      {/* Timeblocks — every brief state is auto-saved; restore previous
          executive summaries while the live one keeps refreshing underneath */}
      <Timeblocks
        refreshKey={brief?.generated_at ?? 0}
        currentGeneratedAt={snapshotMeta?.generated_at ?? undefined}
        onRestore={onRestoreSnapshot}
        onToast={onToast}
      />

      {/* Deferred shelf — everything snoozed, with when it comes back */}
      <DeferredShelf refreshKey={brief?.generated_at ?? 0} />

      {/* Open loops — commitments in flight, derived from every pass */}
      <div className="mb-4"><OpenLoops refreshKey={brief?.generated_at ?? 0} onDraft={onSend} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-solent-border bg-solent-surface/90 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-solent-border/50">
            <div>
              <span className="flex items-center gap-1.5 text-solent-dim font-mono text-[10px] tracking-widest"><Target className="w-3.5 h-3.5" /> TODAY</span>
              <h2 className="text-solent-text text-sm font-semibold mt-1">Priority queue</h2>
            </div>
            <button
              onClick={() => setAddingTask((v) => !v)}
              className={`flex items-center gap-1 text-[10px] border rounded px-2 py-1 transition-colors ${addingTask ? 'border-solent-mint/50 text-solent-mint' : 'text-solent-dim border-solent-border hover:text-solent-text'}`}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {addingTask && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                onAddTask(newTask.trim());
                setNewTask('');
                setAddingTask(false);
              }}
              className="flex items-center gap-2 px-4 py-3 border-b border-solent-border/50 bg-solent-mint/[.03]"
            >
              <Plus className="w-4 h-4 text-solent-mint shrink-0" />
              <input
                autoFocus
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setAddingTask(false); }}
                placeholder="What needs doing? (Enter to add · Esc to cancel)"
                className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-solent-dim outline-none"
              />
              <button type="submit" disabled={!newTask.trim()} className="text-[10px] font-mono px-2.5 py-1 rounded bg-solent-mint text-solent-bg font-semibold disabled:opacity-40">
                Add
              </button>
            </form>
          )}
          <div>
            {tasks.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-solent-dim text-xs">No priorities yet. Run the brief — real tasks land here from your sources.</p>
              </div>
            )}
            {tasks.filter((t) => !deferredIds.has(t.id)).map((task) => (
              <motion.div
                layout
                key={task.id}
                onClick={() => onToggleTask(task.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onToggleTask(task.id); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-solent-border/40 text-left hover:bg-white/[.02] transition-colors cursor-pointer ${task.done ? 'opacity-50' : ''}`}
              >
                <span className={`w-5 h-5 grid place-items-center rounded border ${task.done ? 'border-solent-mint bg-solent-mint/10 text-solent-mint' : 'border-solent-border text-transparent'}`}>
                  {task.done ? <Check className="w-3 h-3" /> : <Circle className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs font-medium truncate ${task.done ? 'line-through text-solent-muted' : 'text-zinc-300'}`}>{task.title}</span>
                  <span className="block text-[10px] text-solent-dim mt-0.5">{task.context}</span>
                </span>
                {!task.done && <TaskDefer taskId={task.id} onDeferred={() => setDeferredIds((s) => new Set(s).add(task.id))} />}
                <time className="text-[10px] font-mono text-solent-dim">{task.time}</time>
                <ChevronRight className="w-4 h-4 text-solent-border" />
              </motion.div>
            ))}
          </div>
          <div className="h-10 flex items-center justify-between px-4 text-[10px] text-solent-dim">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {completed} of {tasks.length} completed</span>
            <button onClick={onToggleContext} className="hover:text-solent-mint transition-colors flex items-center gap-1">View timeline <ArrowRight className="w-3 h-3" /></button>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-solent-border bg-solent-surface/90 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-solent-border/50">
              <div>
                <span className="flex items-center gap-1.5 text-solent-dim font-mono text-[10px] tracking-widest"><Activity className="w-3.5 h-3.5" /> LIVE</span>
                <h2 className="text-solent-text text-sm font-semibold mt-1">Agent activity</h2>
              </div>
              <span className="flex items-center gap-1 text-[9px] font-mono text-solent-mint border border-solent-mint/20 rounded-full px-1.5 py-0.5"><i className="w-1 h-1 rounded-full bg-solent-mint animate-pulse" /> {brief?.sources?.filter((s) => s.ok).length ?? 0} online</span>
            </div>
            <div className="p-2 space-y-1">
              {(brief?.sources ?? []).filter((s) => s.configured).length === 0 && (
                <p className="px-2 py-3 text-[10px] text-solent-dim text-center">No sources connected — activity appears here once they are.</p>
              )}
              {(brief?.sources ?? []).filter((s) => s.configured).map((s, i) => (
                <button key={s.source} onClick={onToggleContext} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/[.02] text-left">
                  <span className="w-7 h-7 rounded grid place-items-center font-mono text-[9px]" style={{ backgroundColor: `${['#38bdf8', '#fb923c', '#a78bfa'][i % 3]}1a`, color: ['#38bdf8', '#fb923c', '#a78bfa'][i % 3] }}>0{i + 1}</span>
                  <span className="min-w-0">
                    <strong className="block text-[10px] font-mono text-zinc-300 truncate uppercase">{s.source}</strong>
                    <small className="block text-[9px] text-solent-dim truncate">{s.ok ? `${s.count} items in last pass` : s.error ?? 'no data yet'}</small>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={onOpenPalette} className="w-[calc(100%-28px)] mx-3.5 mb-3 h-8 flex items-center justify-center gap-1.5 text-[10px] text-solent-dim border border-solent-border rounded hover:text-solent-mint transition-colors"><Users className="w-3.5 h-3.5" /> Ask the council</button>
          </section>

          <section className="rounded-xl border border-solent-border bg-solent-surface/90 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-solent-border/50">
              <div>
                <span className="flex items-center gap-1.5 text-solent-dim font-mono text-[10px] tracking-widest"><TrendingUp className="w-3.5 h-3.5" /> SIGNAL RADAR</span>
                <h2 className="text-solent-text text-sm font-semibold mt-1">What changed</h2>
              </div>
            </div>
            <div>
              {signals.length === 0 && (
                <p className="px-4 py-6 text-[10px] text-solent-dim text-center">Signals distilled from your sources appear here after a pass.</p>
              )}
              {signals.map((s, i) => (
                <button key={s.title} className="w-full flex items-center gap-3 px-4 py-3 border-b border-solent-border/40 text-left hover:bg-white/[.02] last:border-0">
                  <span className={`w-7 h-7 rounded grid place-items-center font-mono text-[9px] ${['text-solent-blue bg-solent-blue/10', 'text-solent-orange bg-solent-orange/10', 'text-solent-purple bg-solent-purple/10', 'text-solent-mint bg-solent-mint/10'][i % 4]}`}>0{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <small className="block text-[9px] font-mono uppercase tracking-wider text-solent-dim">{s.label}</small>
                    <strong className="block text-[11px] font-medium text-zinc-300 truncate">{s.title}</strong>
                    <em className="block text-[9px] font-mono text-solent-dim not-italic">{s.meta}</em>
                  </span>
                  <span className="text-right">
                    <small className="block text-[8px] font-mono text-solent-dim uppercase">conf</small>
                    <strong className="block text-[10px] font-mono text-solent-muted">{s.score}</strong>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-solent-border bg-solent-surface/90 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-solent-border/50">
          <div>
            <span className="flex items-center gap-1.5 text-solent-dim font-mono text-[10px] tracking-widest"><PenLine className="w-3.5 h-3.5" /> DRAFTS</span>
            <h2 className="text-solent-text text-sm font-semibold mt-1">Replies awaiting your call</h2>
          </div>
          <span className="text-[10px] font-mono text-solent-dim">{replyCount || '—'}</span>
        </div>
        <div className="p-4">
          {replyCount === 0 && (
            <p className="text-[10px] text-solent-dim text-center py-2">When a pass finds messages waiting on you, HERMES drafts replies here and in RECEIVE.</p>
          )}
          {(brief?.replies ?? []).map((r, i) => (
            <div key={i} className="flex items-start gap-4 py-2.5 border-b border-solent-border/30 last:border-0">
              <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono ${SOURCE_TONE[r.channel] ?? 'bg-solent-border text-solent-dim'}`}>{r.channel}</span>
              <div className="min-w-0">
                <strong className="block text-[11px] font-medium text-zinc-300">to {r.to} · re: {r.re}</strong>
                <small className="block text-[10px] text-solent-dim truncate">{r.draft}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, color, value, sub, label, tag }: { icon: React.ReactNode; color: 'solent-orange' | 'solent-blue' | 'solent-purple' | 'solent-mint'; value: string; sub?: string; label: string; tag: string }) {
  const tones: Record<typeof color, string> = {
    'solent-orange': 'bg-solent-orange/10 text-solent-orange',
    'solent-blue': 'bg-solent-blue/10 text-solent-blue',
    'solent-purple': 'bg-solent-purple/10 text-solent-purple',
    'solent-mint': 'bg-solent-mint/10 text-solent-mint',
  };
  return (
    <div className="bg-solent-surface/80 p-3.5 flex items-center gap-3 relative">
      <span className={`w-8 h-8 rounded grid place-items-center ${tones[color]}`}>{icon}</span>
      <div className="min-w-0">
        <strong className="text-solent-text font-mono text-lg">{value}{sub && <span className="text-solent-dim text-xs">{sub}</span>}</strong>
        <span className="block text-[10px] text-solent-dim truncate">{label}</span>
      </div>
      <em className="absolute right-2.5 top-2.5 not-italic text-[8px] font-mono text-solent-faint uppercase">{tag}</em>
    </div>
  );
}

/**
 * DEFERRED SHELF — everything snoozed via universal triage, with when it
 * comes back. Items wake automatically; "bring back" reopens one now.
 */
function DeferredShelf({ refreshKey }: { refreshKey: number | string }) {
  const [items, setItems] = useState<DeferredItem[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => { fetchDeferredItems().then(setItems).catch(() => {}); };
  useEffect(load, [refreshKey]);
  if (items.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-solent-border bg-solent-surface/70 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-white/[.02] transition-colors">
        <Clock3 className="w-3.5 h-3.5 text-solent-orange" />
        <span className="text-xs font-semibold text-zinc-300">Deferred</span>
        <span className="px-1.5 py-0.5 rounded bg-solent-orange/10 text-[9px] font-mono text-solent-orange">{items.length}</span>
        <span className="ml-auto text-[9px] font-mono text-solent-dim">{open ? 'hide ▴' : 'show ▾'}</span>
      </button>
      {open && items.map((it) => (
        <div key={it.id} className="flex items-start gap-3 px-4 py-2.5 border-t border-solent-border/30">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-zinc-300 truncate">{it.from_name ?? it.source}{it.channel ? ` · ${it.channel}` : ''}</span>
            <span className="block text-[10px] text-solent-muted line-clamp-1 mt-0.5">{it.title || it.text}</span>
          </span>
          <span className="text-[9px] font-mono text-solent-dim shrink-0 mt-0.5">
            {it.deferred_until && it.deferred_until < 4102444800000
              ? `back ${new Date(it.deferred_until).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'someday'}
          </span>
          <button
            onClick={async () => { try { await triageItemRemote(it.id, 'reopen'); load(); } catch { /* ignore */ } }}
            className="shrink-0 text-[9px] font-mono text-solent-dim hover:text-solent-mint border border-solent-border rounded px-1.5 py-0.5 transition-colors"
          >
            bring back
          </button>
        </div>
      ))}
    </section>
  );
}

/** Defer button for tasks — snoozes via /api/tasks/:id/defer, removed from the queue until it wakes. */
function TaskDefer({ taskId, onDeferred }: { taskId: number; onDeferred: () => void }) {
  const [open, setOpen] = useState(false);
  const choices: { id: DeferChoice; label: string }[] = [
    { id: '3h', label: 'In 3 hours' },
    { id: 'tomorrow', label: 'Tomorrow 9am' },
    { id: 'nextweek', label: 'Next week' },
    { id: 'indefinite', label: 'Someday' },
  ];
  return (
    <span className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Defer this task"
        className="px-1.5 py-0.5 rounded border border-solent-border text-[9px] font-mono uppercase tracking-wider text-solent-dim hover:text-solent-orange hover:border-solent-orange/40 transition-colors"
      >
        defer ▾
      </button>
      {open && (
        <span className="absolute right-0 top-full mt-1 z-[80] min-w-[120px] rounded-lg border border-solent-border bg-solent-surface-2 shadow-xl overflow-hidden block">
          {choices.map((c) => (
            <button
              key={c.id}
              onClick={async () => {
                setOpen(false);
                try { await deferTaskRemote(taskId, c.id); onDeferred(); } catch { /* ignore */ }
              }}
              className="w-full text-left px-3 py-1.5 text-[10px] text-solent-muted hover:text-solent-orange hover:bg-solent-surface-3 transition-colors font-mono block"
            >
              {c.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function ReceiveView({
  brief, briefRunning, onRunBrief, onOpenSources, onSend, onInspect,
}: {
  brief: Brief | null; briefRunning: boolean; onRunBrief: () => void; onOpenSources: () => void; onSend: (text: string) => void; onInspect: (item: InboxItem) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'pumble' | 'gmail' | 'zoho' | 'gcal'>('all');
  const { hidden, hide } = useTriageOverlay(brief?.generated_at);
  const inbox: InboxItem[] = (brief?.inbox ?? [])
    .filter((i) => !hidden.has(`${i.source}:${i.ref}`))
    .filter((i) => (filter === 'all' ? true : filter === 'attention' ? i.needsAttention : i.source === filter))
    .slice()
    // Attention first, then NEWEST first — fresh mail can never sink below old chat.
    .sort((a, b) => Number(!!b.needsAttention) - Number(!!a.needsAttention) || tsValue(b.ts) - tsValue(a.ts));
  const anyConfigured = brief?.sources?.some((s) => s.configured) ?? false;
  const attnCount = (brief?.inbox ?? []).filter((i) => i.needsAttention && !hidden.has(`${i.source}:${i.ref}`)).length;

  return (
    <div className="w-full max-w-4xl mx-auto px-6 md:px-10 py-10 pb-40">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-solent-dim font-mono text-[10px] tracking-widest mb-2 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> UNIFIED INBOX</p>
          <h1 className="text-2xl font-semibold tracking-tight text-solent-text">Everything, one pass.</h1>
          <p className="text-solent-muted text-sm mt-1">Pumble + Gmail + Zoho + Calendar pulled together, newest first, triaged in a single model call.</p>
        </div>
        <button
          onClick={onRunBrief}
          disabled={briefRunning}
          className="flex items-center gap-2 px-3 h-8 rounded-md border border-solent-mint/40 text-solent-mint text-xs font-semibold hover:bg-solent-mint/10 disabled:opacity-60 transition-colors"
        >
          {briefRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {briefRunning ? 'Pulling sources…' : 'Pull & triage now'}
        </button>
      </div>

      <div className="mb-5"><SourceChips brief={brief} onOpenSources={onOpenSources} /></div>

      {brief && brief.replies.length > 0 && (
        <section className="mb-5 rounded-xl border border-solent-purple/25 bg-solent-purple/[.04] overflow-hidden">
          <div className="px-4 py-3 border-b border-solent-purple/20 flex items-center gap-2">
            <PenLine className="w-3.5 h-3.5 text-solent-purple" />
            <h2 className="text-xs font-semibold text-zinc-200">HERMES · drafted replies awaiting your call</h2>
          </div>
          {brief.replies.map((r, i) => (
            <div key={i} className="px-4 py-3 border-b border-solent-border/30 last:border-0">
              <div className="flex items-center gap-2 text-[10px] font-mono text-solent-dim mb-1.5">
                <span className={`px-1.5 py-0.5 rounded ${SOURCE_TONE[r.channel] ?? 'bg-solent-border text-solent-dim'}`}>{r.channel}</span>
                <span className="text-zinc-400">to {r.to}</span>
                <span className="truncate">· re: {r.re}</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed mb-2">{r.draft}</p>
              <button
                onClick={() => onSend(`Refine and finalise this ${r.channel} reply to ${r.to} (re: ${r.re}): "${r.draft}"`)}
                className="text-[10px] font-mono text-solent-purple hover:text-solent-mint transition-colors"
              >
                Refine with CONDUCTOR →
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="flex items-center gap-1 mb-3">
        {(['all', 'attention', 'pumble', 'gmail', 'zoho', 'gcal'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
              filter === f ? 'bg-solent-mint/10 text-solent-mint' : 'text-solent-dim hover:text-solent-text'
            }`}
          >
            {f === 'attention' ? `needs you${attnCount ? ` ${attnCount}` : ''}` : f}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-solent-dim">{inbox.length} items</span>
      </div>

      <section className="rounded-xl border border-solent-border bg-solent-surface/90 overflow-hidden">
        {inbox.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-solent-muted text-sm mb-3">
              {!brief
                ? 'Loading state from the Worker…'
                : !anyConfigured
                  ? 'No sources connected yet. Connect Pumble and your inboxes to activate the executive layer.'
                  : 'Nothing pulled yet for this window. Run the pass to fetch fresh items.'}
            </p>
            {brief && !anyConfigured ? (
              <button onClick={onOpenSources} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-solent-mint text-solent-bg text-xs font-semibold hover:opacity-90 transition-opacity">
                <Plug className="w-3.5 h-3.5" /> Connect sources
              </button>
            ) : brief ? (
              <button onClick={onRunBrief} disabled={briefRunning} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-solent-mint/40 text-solent-mint text-xs font-semibold hover:bg-solent-mint/10 disabled:opacity-60 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Pull now
              </button>
            ) : null}
          </div>
        )}
        {inbox.map((item, i) => (
          <div
            key={`${item.source}-${item.ref}-${i}`}
            onClick={() => onInspect(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onInspect(item); }}
            className={`flex items-start gap-3 px-4 py-3 border-b border-solent-border/40 last:border-0 hover:bg-white/[.03] transition-colors cursor-pointer ${item.needsAttention ? 'bg-solent-orange/[.03] border-l-2 border-l-solent-orange/60' : ''}`}
            title="Click for full context"
          >
            <span className={`mt-0.5 w-6 h-6 rounded grid place-items-center shrink-0 ${SOURCE_TONE[item.source]}`}>{SOURCE_ICON[item.source]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-[11px] font-medium text-zinc-300 truncate">{item.from}</strong>
                {item.channel && <span className="px-1.5 py-0.5 rounded bg-solent-border/60 text-[9px] font-mono text-solent-dim">{item.channel}</span>}
                {item.mentionsMe ? <span className="flex items-center gap-0.5 text-[9px] font-mono text-solent-blue"><AtSign className="w-2.5 h-2.5" />you</span> : null}
                {item.repliedSince ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-solent-mint/10 text-[9px] font-mono text-solent-mint" title="You've sent this person a reply since this arrived — handled">
                    <Check className="w-2.5 h-2.5" />replied
                  </span>
                ) : null}
                {item.needsAttention ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-solent-orange/10 text-[9px] font-mono text-solent-orange">
                    <AlertTriangle className="w-2.5 h-2.5" />{item.attentionReason ?? 'needs you'}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-solent-muted leading-relaxed mt-0.5 line-clamp-2">{item.text}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); onSend(`Draft a reply to this ${item.source} message from ${item.from} (${item.title}): "${item.text}"`); }}
                className="text-[9px] font-mono text-solent-dim hover:text-solent-mint transition-colors"
                title="Draft a reply with CONDUCTOR"
              >
                reply →
              </button>
              <TriageActions target={{ source: item.source, ref: item.ref }} onDone={() => hide(item.source, item.ref)} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function FocusView({ focusTime, running, onToggle, onReset, target }: { focusTime: string; running: boolean; onToggle: () => void; onReset: () => void; target?: string }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center relative p-10 text-center overflow-hidden">
      <div className="absolute inset-[15%_10%] bg-[radial-gradient(circle,rgba(124,245,165,.09),transparent_58%)] pointer-events-none" />
      <div className="w-20 h-20 relative mb-6 border border-solent-mint/20 rounded-full animate-[spin_18s_linear_infinite]">
        <div className="absolute inset-3 border border-solent-mint/10 rounded-full" />
        <div className="absolute inset-7 bg-solent-mint/10 rounded-full shadow-[0_0_28px_rgba(124,245,165,.18)]" />
      </div>
      <p className="text-solent-mint/70 font-mono text-[10px] tracking-widest uppercase mb-3">Focus protocol</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-solent-text">One thing, done well.</h1>
      <p className="text-solent-muted text-sm mt-3">{target ?? 'No open priority — run the brief to load one.'}</p>
      <div className="my-9 text-solent-text font-mono text-6xl md:text-7xl tracking-tighter">{focusTime}</div>
      <div className="flex gap-2">
        <button onClick={onToggle} className="px-4 h-9 rounded-md border border-solent-mint bg-solent-mint text-solent-bg text-xs font-semibold hover:opacity-90 transition-opacity">
          {running ? 'Pause session' : 'Resume session'}
        </button>
        <button onClick={onReset} className="px-4 h-9 rounded-md border border-solent-border bg-solent-surface text-solent-muted text-xs hover:text-solent-text transition-colors">
          Reset
        </button>
      </div>
    </div>
  );
}

function PerformanceView({ completed, tasks }: { completed: number; tasks: Task[] }) {
  const total = tasks.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const open = total - completed;
  return (
    <div className="w-full max-w-3xl mx-auto px-6 md:px-10 py-12">
      <h1 className="text-2xl font-semibold text-solent-text mb-1">Performance</h1>
      <p className="text-solent-muted text-sm mb-8">Execution telemetry for today.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-solent-border bg-solent-surface/90 p-5">
          <span className="text-[10px] font-mono text-solent-dim uppercase tracking-widest">Priority completion</span>
          <div className="text-3xl font-mono text-solent-mint mt-2">{total ? `${pct}%` : '—'}</div>
          <div className="h-1.5 mt-3 rounded-full bg-solent-border overflow-hidden"><span className="block h-full bg-solent-mint" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="rounded-xl border border-solent-border bg-solent-surface/90 p-5">
          <span className="text-[10px] font-mono text-solent-dim uppercase tracking-widest">Completed</span>
          <div className="text-3xl font-mono text-solent-blue mt-2">{completed}</div>
          <span className="text-[10px] text-solent-dim">of {total || '—'} priorities</span>
        </div>
        <div className="rounded-xl border border-solent-border bg-solent-surface/90 p-5">
          <span className="text-[10px] font-mono text-solent-dim uppercase tracking-widest">Still open</span>
          <div className="text-3xl font-mono text-solent-purple mt-2">{open}</div>
          <span className="text-[10px] text-solent-dim">{open ? 'needs attention' : 'all clear'}</span>
        </div>
      </div>
      {total === 0 && <p className="text-solent-dim text-xs mt-6">Nothing tracked yet — run the one-shot brief to populate priorities from your sources.</p>}
    </div>
  );
}
