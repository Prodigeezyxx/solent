import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  Mic, Terminal, ChevronRight, Hash, Send, Target, Clock3, Radio, Gauge,
  Check, CheckCircle2, Circle, Activity, TrendingUp, CalendarDays, Plus, ArrowRight,
  Sparkles, Inbox, Users, Loader2, Plug, RefreshCw, Mail, MessageSquare, PenLine, AlertTriangle, AtSign,
} from 'lucide-react';
import type { Mode, Task, Message } from '../types';
import type { Brief, InboxItem } from '../lib/api';
import KnowledgeGraph from './KnowledgeGraph';

interface CenterStageProps {
  mode: Mode;
  tasks: Task[];
  onToggleTask: (id: number) => void;
  messages: Message[];
  onSend: (text: string) => void;
  onOpenPalette: () => void;
  onToggleContext: () => void;
  streaming?: boolean;
  brief: Brief | null;
  briefRunning: boolean;
  onRunBrief: () => void;
  onOpenSources: () => void;
}

const FOCUS_SECONDS = 50 * 60;

export default function CenterStage({
  mode, tasks, onToggleTask, messages, onSend, onOpenPalette, onToggleContext, streaming,
  brief, briefRunning, onRunBrief, onOpenSources,
}: CenterStageProps) {
  const [input, setInput] = useState('');
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(FOCUS_SECONDS);
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
    <div className="flex-1 flex flex-col min-w-0 h-full bg-nexus-bg relative">
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-100" />

      <div className="relative flex-1 overflow-y-auto">
        {mode === 'COMMAND' && (
          <Dashboard
            completed={completed}
            tasks={tasks}
            onToggleTask={onToggleTask}
            onOpenPalette={onOpenPalette}
            onToggleContext={onToggleContext}
            brief={brief}
            briefRunning={briefRunning}
            onRunBrief={onRunBrief}
            onOpenSources={onOpenSources}
          />
        )}

        {mode === 'RECEIVE' && (
          <ReceiveView brief={brief} briefRunning={briefRunning} onRunBrief={onRunBrief} onOpenSources={onOpenSources} onSend={onSend} />
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
                    <span className={`text-[10px] font-mono tracking-widest uppercase ${msg.sender === 'USER' ? 'text-nexus-dim' : 'text-nexus-mint'}`}>
                      {msg.sender}
                    </span>
                    <span className="text-[10px] font-mono text-nexus-dim">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`text-sm md:text-base leading-relaxed ${msg.sender === 'USER' ? 'text-zinc-300 bg-nexus-border/30 px-4 py-3 rounded-lg border border-nexus-border/50' : 'text-zinc-200'}`}>
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
      />
    </div>
  );
}

function Composer({
  value, onChange, onSubmit, onOpenPalette, chatMode, streaming,
}: {
  value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void;
  onOpenPalette: () => void; chatMode: boolean; streaming?: boolean;
}) {
  return (
    <div className="relative z-10 p-4 md:p-8 bg-gradient-to-t from-nexus-bg via-nexus-bg to-transparent">
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={onSubmit}
          className="relative bg-nexus-surface/80 border border-nexus-border rounded-lg shadow-2xl backdrop-blur-xl group focus-within:border-nexus-mint/50 transition-colors"
        >
          <div className="flex items-center px-4 py-3">
            <ChevronRight className="w-5 h-5 text-nexus-mint mr-2 shrink-0" />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={chatMode ? 'Command CONDUCTOR, or press Space to dictate…' : 'Capture a thought or ask CONDUCTOR…'}
              className="flex-1 bg-transparent border-none outline-none text-zinc-100 placeholder:text-nexus-dim font-sans text-sm md:text-base"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" className="p-2 text-nexus-dim hover:text-nexus-mint transition-colors rounded-md hover:bg-nexus-border/50" aria-label="Voice">
                <Mic className="w-4 h-4" />
              </button>
              <button type="button" onClick={onOpenPalette} className="p-2 text-nexus-dim hover:text-nexus-text transition-colors rounded-md hover:bg-nexus-border/50" aria-label="Commands">
                <Hash className="w-4 h-4" />
              </button>
              <button type="submit" disabled={!value.trim()} className="p-2 text-nexus-mint disabled:text-nexus-dim disabled:opacity-50 transition-colors rounded-md hover:bg-nexus-mint/10" aria-label="Send">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-nexus-border/50 flex items-center justify-between text-[10px] font-mono text-nexus-dim bg-black/20 rounded-b-lg">
            <div className="flex items-center gap-4">
              <span><kbd className="bg-nexus-border px-1 rounded">⌘K</kbd> Palette</span>
              <span><kbd className="bg-nexus-border px-1 rounded">Space</kbd> Voice</span>
              <span><kbd className="bg-nexus-border px-1 rounded">/</kbd> Commands</span>
            </div>
            <div className="flex items-center gap-2 text-nexus-mint/70">
              <Terminal className="w-3 h-3" />
              <span>{streaming ? 'CONDUCTOR thinking…' : 'NEXUS v0.2'}</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  pumble: <MessageSquare className="w-3 h-3" />,
  gmail: <Mail className="w-3 h-3" />,
  zoho: <Mail className="w-3 h-3" />,
};

const SOURCE_TONE: Record<string, string> = {
  pumble: 'text-nexus-purple bg-nexus-purple/10',
  gmail: 'text-nexus-orange bg-nexus-orange/10',
  zoho: 'text-nexus-blue bg-nexus-blue/10',
};

function SourceChips({ brief, onOpenSources }: { brief: Brief | null; onOpenSources: () => void }) {
  const sources = brief?.sources ?? [
    { source: 'pumble', configured: false, ok: false, count: 0 },
    { source: 'gmail', configured: false, ok: false, count: 0 },
    { source: 'zoho', configured: false, ok: false, count: 0 },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {sources.map((s) => (
        <button
          key={s.source}
          onClick={onOpenSources}
          title={s.error ?? (s.ok ? `${s.count} items` : s.configured ? 'configured, no data yet' : 'not connected')}
          className={`flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider rounded-full border px-2 py-0.5 transition-colors ${
            s.ok
              ? 'border-nexus-mint/40 text-nexus-mint'
              : s.configured
                ? 'border-nexus-orange/40 text-nexus-orange'
                : 'border-nexus-border text-nexus-dim hover:text-nexus-text'
          }`}
        >
          <i className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-nexus-mint' : s.configured ? 'bg-nexus-orange' : 'bg-nexus-border'}`} />
          {s.source}
          {s.ok && <span className="text-nexus-dim">·{s.count}</span>}
        </button>
      ))}
      <button onClick={onOpenSources} className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider rounded-full border border-nexus-border px-2 py-0.5 text-nexus-dim hover:text-nexus-mint transition-colors">
        <Plug className="w-2.5 h-2.5" /> sources
      </button>
    </div>
  );
}

function Dashboard({
  completed, tasks, onToggleTask, onOpenPalette, onToggleContext, brief, briefRunning, onRunBrief, onOpenSources,
}: {
  completed: number; tasks: Task[]; onToggleTask: (id: number) => void;
  onOpenPalette: () => void; onToggleContext: () => void;
  brief: Brief | null; briefRunning: boolean; onRunBrief: () => void; onOpenSources: () => void;
}) {
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const signals = brief?.signals ?? [];
  const connected = brief?.sources?.filter((s) => s.ok).length ?? 0;
  const inboxCount = brief?.inbox?.length ?? 0;
  const replyCount = brief?.replies?.length ?? 0;
  const needsYou = brief?.needs_attention ?? brief?.inbox?.filter((i) => i.needsAttention).length ?? 0;
  return (
    <div className="w-full max-w-5xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-end justify-between gap-6 mb-4 flex-wrap">
        <div>
          <p className="text-nexus-dim font-mono text-[10px] tracking-widest mb-2">{today}</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-nexus-text">{greeting}.</h1>
          <p className="text-nexus-muted text-sm mt-2">
            {brief?.headline
              ? <strong className="text-zinc-300 font-medium">{brief.headline}</strong>
              : <>Run the one-shot pass to pull Pumble + Gmail + Zoho and triage your day.</>}
          </p>
        </div>
        <button
          onClick={onRunBrief}
          disabled={briefRunning}
          className="flex items-center gap-2 border border-nexus-border rounded-lg px-3 py-2 bg-nexus-mint/5 hover:border-nexus-mint/40 disabled:opacity-60 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-nexus-mint text-xs font-semibold">
            {briefRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {briefRunning ? 'Running one-shot pass…' : 'Run brief'}
          </span>
          <small className="text-nexus-dim text-[10px]">
            {brief ? `${brief.cached ? 'cached · ' : ''}${new Date(brief.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '1 model call'}
          </small>
          <ArrowRight className="w-4 h-4 text-nexus-mint" />
        </button>
      </div>

      <div className="mb-6"><SourceChips brief={brief} onOpenSources={onOpenSources} /></div>

      {brief?.summary && (
        <div className="mb-4 rounded-xl border border-nexus-mint/20 bg-nexus-mint/[.04] p-4 text-sm text-zinc-300 leading-relaxed">
          <span className="block text-[9px] font-mono uppercase tracking-widest text-nexus-mint mb-1.5">Conductor · executive summary</span>
          {brief.summary}
          {brief.error && <span className="block mt-2 text-[10px] text-nexus-orange font-mono">⚠ {brief.error}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border border-nexus-border bg-nexus-border overflow-hidden mb-4">
        <Metric icon={<AlertTriangle className="w-4 h-4" />} color={'nexus-orange' as const} value={`${needsYou}`} label="Needs you" tag={needsYou ? 'act now' : 'clear'} />
        <Metric icon={<Radio className="w-4 h-4" />} color={'nexus-purple' as const} value={`${inboxCount}`} label="Items in last pass" tag={brief ? 'scanned' : '—'} />
        <Metric icon={<Clock3 className="w-4 h-4" />} color={'nexus-blue' as const} value={`${replyCount}`} label="Replies drafted" tag={replyCount ? 'awaiting you' : '—'} />
        <Metric icon={<Gauge className="w-4 h-4" />} color={'nexus-mint' as const} value={`${connected}`} sub="/3" label="Sources connected" tag={connected ? 'online' : 'connect'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-nexus-border/50">
            <div>
              <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest"><Target className="w-3.5 h-3.5" /> TODAY</span>
              <h2 className="text-nexus-text text-sm font-semibold mt-1">Priority queue</h2>
            </div>
            <button className="flex items-center gap-1 text-[10px] text-nexus-dim border border-nexus-border rounded px-2 py-1 hover:text-nexus-text transition-colors"><Plus className="w-3.5 h-3.5" /> Add</button>
          </div>
          <div>
            {tasks.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-nexus-dim text-xs">No priorities yet. Run the brief — real tasks land here from your sources.</p>
              </div>
            )}
            {tasks.map((task) => (
              <motion.button
                layout
                key={task.id}
                onClick={() => onToggleTask(task.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-nexus-border/40 text-left hover:bg-white/[.02] transition-colors ${task.done ? 'opacity-50' : ''}`}
              >
                <span className={`w-5 h-5 grid place-items-center rounded border ${task.done ? 'border-nexus-mint bg-nexus-mint/10 text-nexus-mint' : 'border-nexus-border text-transparent'}`}>
                  {task.done ? <Check className="w-3 h-3" /> : <Circle className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs font-medium truncate ${task.done ? 'line-through text-nexus-muted' : 'text-zinc-300'}`}>{task.title}</span>
                  <span className="block text-[10px] text-nexus-dim mt-0.5">{task.context}</span>
                </span>
                <time className="text-[10px] font-mono text-nexus-dim">{task.time}</time>
                <ChevronRight className="w-4 h-4 text-nexus-border" />
              </motion.button>
            ))}
          </div>
          <div className="h-10 flex items-center justify-between px-4 text-[10px] text-nexus-dim">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {completed} of {tasks.length} completed</span>
            <button onClick={onToggleContext} className="hover:text-nexus-mint transition-colors flex items-center gap-1">View timeline <ArrowRight className="w-3 h-3" /></button>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-nexus-border/50">
              <div>
                <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest"><Activity className="w-3.5 h-3.5" /> LIVE</span>
                <h2 className="text-nexus-text text-sm font-semibold mt-1">Agent activity</h2>
              </div>
              <span className="flex items-center gap-1 text-[9px] font-mono text-nexus-mint border border-nexus-mint/20 rounded-full px-1.5 py-0.5"><i className="w-1 h-1 rounded-full bg-nexus-mint animate-pulse" /> {brief?.sources?.filter((s) => s.ok).length ?? 0} online</span>
            </div>
            <div className="p-2 space-y-1">
              {(brief?.sources ?? []).filter((s) => s.configured).length === 0 && (
                <p className="px-2 py-3 text-[10px] text-nexus-dim text-center">No sources connected — activity appears here once they are.</p>
              )}
              {(brief?.sources ?? []).filter((s) => s.configured).map((s, i) => (
                <button key={s.source} onClick={onToggleContext} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/[.02] text-left">
                  <span className="w-7 h-7 rounded grid place-items-center font-mono text-[9px]" style={{ backgroundColor: `${['#38bdf8', '#fb923c', '#a78bfa'][i % 3]}1a`, color: ['#38bdf8', '#fb923c', '#a78bfa'][i % 3] }}>0{i + 1}</span>
                  <span className="min-w-0">
                    <strong className="block text-[10px] font-mono text-zinc-300 truncate uppercase">{s.source}</strong>
                    <small className="block text-[9px] text-nexus-dim truncate">{s.ok ? `${s.count} items in last pass` : s.error ?? 'no data yet'}</small>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={onOpenPalette} className="w-[calc(100%-28px)] mx-3.5 mb-3 h-8 flex items-center justify-center gap-1.5 text-[10px] text-nexus-dim border border-nexus-border rounded hover:text-nexus-mint transition-colors"><Users className="w-3.5 h-3.5" /> Ask the council</button>
          </section>

          <section className="rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-nexus-border/50">
              <div>
                <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest"><TrendingUp className="w-3.5 h-3.5" /> SIGNAL RADAR</span>
                <h2 className="text-nexus-text text-sm font-semibold mt-1">What changed</h2>
              </div>
            </div>
            <div>
              {signals.length === 0 && (
                <p className="px-4 py-6 text-[10px] text-nexus-dim text-center">Signals distilled from your sources appear here after a pass.</p>
              )}
              {signals.map((s, i) => (
                <button key={s.title} className="w-full flex items-center gap-3 px-4 py-3 border-b border-nexus-border/40 text-left hover:bg-white/[.02] last:border-0">
                  <span className={`w-7 h-7 rounded grid place-items-center font-mono text-[9px] ${['text-nexus-blue bg-nexus-blue/10', 'text-nexus-orange bg-nexus-orange/10', 'text-nexus-purple bg-nexus-purple/10', 'text-nexus-mint bg-nexus-mint/10'][i % 4]}`}>0{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <small className="block text-[9px] font-mono uppercase tracking-wider text-nexus-dim">{s.label}</small>
                    <strong className="block text-[11px] font-medium text-zinc-300 truncate">{s.title}</strong>
                    <em className="block text-[9px] font-mono text-nexus-dim not-italic">{s.meta}</em>
                  </span>
                  <span className="text-right">
                    <small className="block text-[8px] font-mono text-nexus-dim uppercase">conf</small>
                    <strong className="block text-[10px] font-mono text-nexus-muted">{s.score}</strong>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-nexus-border/50">
          <div>
            <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest"><PenLine className="w-3.5 h-3.5" /> DRAFTS</span>
            <h2 className="text-nexus-text text-sm font-semibold mt-1">Replies awaiting your call</h2>
          </div>
          <span className="text-[10px] font-mono text-nexus-dim">{replyCount || '—'}</span>
        </div>
        <div className="p-4">
          {replyCount === 0 && (
            <p className="text-[10px] text-nexus-dim text-center py-2">When a pass finds messages waiting on you, HERMES drafts replies here and in RECEIVE.</p>
          )}
          {(brief?.replies ?? []).map((r, i) => (
            <div key={i} className="flex items-start gap-4 py-2.5 border-b border-nexus-border/30 last:border-0">
              <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono ${SOURCE_TONE[r.channel] ?? 'bg-nexus-border text-nexus-dim'}`}>{r.channel}</span>
              <div className="min-w-0">
                <strong className="block text-[11px] font-medium text-zinc-300">to {r.to} · re: {r.re}</strong>
                <small className="block text-[10px] text-nexus-dim truncate">{r.draft}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, color, value, sub, label, tag }: { icon: React.ReactNode; color: 'nexus-orange' | 'nexus-blue' | 'nexus-purple' | 'nexus-mint'; value: string; sub?: string; label: string; tag: string }) {
  const tones: Record<typeof color, string> = {
    'nexus-orange': 'bg-nexus-orange/10 text-nexus-orange',
    'nexus-blue': 'bg-nexus-blue/10 text-nexus-blue',
    'nexus-purple': 'bg-nexus-purple/10 text-nexus-purple',
    'nexus-mint': 'bg-nexus-mint/10 text-nexus-mint',
  };
  return (
    <div className="bg-nexus-surface/80 p-3.5 flex items-center gap-3 relative">
      <span className={`w-8 h-8 rounded grid place-items-center ${tones[color]}`}>{icon}</span>
      <div className="min-w-0">
        <strong className="text-nexus-text font-mono text-lg">{value}{sub && <span className="text-nexus-dim text-xs">{sub}</span>}</strong>
        <span className="block text-[10px] text-nexus-dim truncate">{label}</span>
      </div>
      <em className="absolute right-2.5 top-2.5 not-italic text-[8px] font-mono text-nexus-faint uppercase">{tag}</em>
    </div>
  );
}

function ReceiveView({
  brief, briefRunning, onRunBrief, onOpenSources, onSend,
}: {
  brief: Brief | null; briefRunning: boolean; onRunBrief: () => void; onOpenSources: () => void; onSend: (text: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'pumble' | 'gmail' | 'zoho'>('all');
  const inbox: InboxItem[] = (brief?.inbox ?? [])
    .filter((i) => (filter === 'all' ? true : filter === 'attention' ? i.needsAttention : i.source === filter))
    .slice()
    .sort((a, b) => Number(!!b.needsAttention) - Number(!!a.needsAttention));
  const anyConfigured = brief?.sources?.some((s) => s.configured) ?? false;
  const attnCount = (brief?.inbox ?? []).filter((i) => i.needsAttention).length;

  return (
    <div className="w-full max-w-4xl mx-auto px-6 md:px-10 py-10 pb-40">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-nexus-dim font-mono text-[10px] tracking-widest mb-2 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> UNIFIED INBOX</p>
          <h1 className="text-2xl font-semibold tracking-tight text-nexus-text">Everything, one pass.</h1>
          <p className="text-nexus-muted text-sm mt-1">Pumble + Gmail + Zoho pulled together, triaged in a single model call.</p>
        </div>
        <button
          onClick={onRunBrief}
          disabled={briefRunning}
          className="flex items-center gap-2 px-3 h-8 rounded-md border border-nexus-mint/40 text-nexus-mint text-xs font-semibold hover:bg-nexus-mint/10 disabled:opacity-60 transition-colors"
        >
          {briefRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {briefRunning ? 'Pulling sources…' : 'Pull & triage now'}
        </button>
      </div>

      <div className="mb-5"><SourceChips brief={brief} onOpenSources={onOpenSources} /></div>

      {brief && brief.replies.length > 0 && (
        <section className="mb-5 rounded-xl border border-nexus-purple/25 bg-nexus-purple/[.04] overflow-hidden">
          <div className="px-4 py-3 border-b border-nexus-purple/20 flex items-center gap-2">
            <PenLine className="w-3.5 h-3.5 text-nexus-purple" />
            <h2 className="text-xs font-semibold text-zinc-200">HERMES · drafted replies awaiting your call</h2>
          </div>
          {brief.replies.map((r, i) => (
            <div key={i} className="px-4 py-3 border-b border-nexus-border/30 last:border-0">
              <div className="flex items-center gap-2 text-[10px] font-mono text-nexus-dim mb-1.5">
                <span className={`px-1.5 py-0.5 rounded ${SOURCE_TONE[r.channel] ?? 'bg-nexus-border text-nexus-dim'}`}>{r.channel}</span>
                <span className="text-zinc-400">to {r.to}</span>
                <span className="truncate">· re: {r.re}</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed mb-2">{r.draft}</p>
              <button
                onClick={() => onSend(`Refine and finalise this ${r.channel} reply to ${r.to} (re: ${r.re}): "${r.draft}"`)}
                className="text-[10px] font-mono text-nexus-purple hover:text-nexus-mint transition-colors"
              >
                Refine with CONDUCTOR →
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="flex items-center gap-1 mb-3">
        {(['all', 'attention', 'pumble', 'gmail', 'zoho'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
              filter === f ? 'bg-nexus-mint/10 text-nexus-mint' : 'text-nexus-dim hover:text-nexus-text'
            }`}
          >
            {f === 'attention' ? `needs you${attnCount ? ` ${attnCount}` : ''}` : f}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-nexus-dim">{inbox.length} items</span>
      </div>

      <section className="rounded-xl border border-nexus-border bg-nexus-surface/90 overflow-hidden">
        {inbox.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-nexus-muted text-sm mb-3">
              {!brief
                ? 'Loading state from the Worker…'
                : !anyConfigured
                  ? 'No sources connected yet. Connect Pumble and your inboxes to activate the executive layer.'
                  : 'Nothing pulled yet for this window. Run the pass to fetch fresh items.'}
            </p>
            {brief && !anyConfigured ? (
              <button onClick={onOpenSources} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-nexus-mint text-nexus-bg text-xs font-semibold hover:opacity-90 transition-opacity">
                <Plug className="w-3.5 h-3.5" /> Connect sources
              </button>
            ) : brief ? (
              <button onClick={onRunBrief} disabled={briefRunning} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-nexus-mint/40 text-nexus-mint text-xs font-semibold hover:bg-nexus-mint/10 disabled:opacity-60 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Pull now
              </button>
            ) : null}
          </div>
        )}
        {inbox.map((item, i) => (
          <div key={`${item.source}-${item.ref}-${i}`} className={`flex items-start gap-3 px-4 py-3 border-b border-nexus-border/40 last:border-0 hover:bg-white/[.02] transition-colors ${item.needsAttention ? 'bg-nexus-orange/[.03] border-l-2 border-l-nexus-orange/60' : ''}`}>
            <span className={`mt-0.5 w-6 h-6 rounded grid place-items-center shrink-0 ${SOURCE_TONE[item.source]}`}>{SOURCE_ICON[item.source]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-[11px] font-medium text-zinc-300 truncate">{item.from}</strong>
                {item.channel && <span className="px-1.5 py-0.5 rounded bg-nexus-border/60 text-[9px] font-mono text-nexus-dim">{item.channel}</span>}
                {item.mentionsMe ? <span className="flex items-center gap-0.5 text-[9px] font-mono text-nexus-blue"><AtSign className="w-2.5 h-2.5" />you</span> : null}
                {item.needsAttention ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-nexus-orange/10 text-[9px] font-mono text-nexus-orange">
                    <AlertTriangle className="w-2.5 h-2.5" />{item.attentionReason ?? 'needs you'}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-nexus-muted leading-relaxed mt-0.5 line-clamp-2">{item.text}</p>
            </div>
            <button
              onClick={() => onSend(`Draft a reply to this ${item.source} message from ${item.from} (${item.title}): "${item.text}"`)}
              className="shrink-0 text-[9px] font-mono text-nexus-dim hover:text-nexus-mint transition-colors mt-0.5"
              title="Draft a reply with CONDUCTOR"
            >
              reply →
            </button>
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
      <div className="w-20 h-20 relative mb-6 border border-nexus-mint/20 rounded-full animate-[spin_18s_linear_infinite]">
        <div className="absolute inset-3 border border-nexus-mint/10 rounded-full" />
        <div className="absolute inset-7 bg-nexus-mint/10 rounded-full shadow-[0_0_28px_rgba(124,245,165,.18)]" />
      </div>
      <p className="text-nexus-mint/70 font-mono text-[10px] tracking-widest uppercase mb-3">Focus protocol</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-nexus-text">One thing, done well.</h1>
      <p className="text-nexus-muted text-sm mt-3">{target ?? 'No open priority — run the brief to load one.'}</p>
      <div className="my-9 text-nexus-text font-mono text-6xl md:text-7xl tracking-tighter">{focusTime}</div>
      <div className="flex gap-2">
        <button onClick={onToggle} className="px-4 h-9 rounded-md border border-nexus-mint bg-nexus-mint text-nexus-bg text-xs font-semibold hover:opacity-90 transition-opacity">
          {running ? 'Pause session' : 'Resume session'}
        </button>
        <button onClick={onReset} className="px-4 h-9 rounded-md border border-nexus-border bg-nexus-surface text-nexus-muted text-xs hover:text-nexus-text transition-colors">
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
      <h1 className="text-2xl font-semibold text-nexus-text mb-1">Performance</h1>
      <p className="text-nexus-muted text-sm mb-8">Execution telemetry for today.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">Priority completion</span>
          <div className="text-3xl font-mono text-nexus-mint mt-2">{total ? `${pct}%` : '—'}</div>
          <div className="h-1.5 mt-3 rounded-full bg-nexus-border overflow-hidden"><span className="block h-full bg-nexus-mint" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">Completed</span>
          <div className="text-3xl font-mono text-nexus-blue mt-2">{completed}</div>
          <span className="text-[10px] text-nexus-dim">of {total || '—'} priorities</span>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">Still open</span>
          <div className="text-3xl font-mono text-nexus-purple mt-2">{open}</div>
          <span className="text-[10px] text-nexus-dim">{open ? 'needs attention' : 'all clear'}</span>
        </div>
      </div>
      {total === 0 && <p className="text-nexus-dim text-xs mt-6">Nothing tracked yet — run the one-shot brief to populate priorities from your sources.</p>}
    </div>
  );
}
