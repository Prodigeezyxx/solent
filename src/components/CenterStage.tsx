import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  Mic, Terminal, ChevronRight, Hash, Send, Target, Clock3, Radio, Gauge,
  Check, CheckCircle2, Circle, Activity, TrendingUp, CalendarDays, Plus, ArrowRight,
  Sparkles, LayoutGrid, BrainCircuit, Inbox, Users,
} from 'lucide-react';
import type { Mode, Task, Message } from '../types';
import { SIGNALS, SCHEDULE, TASKS } from '../data/agents';

interface CenterStageProps {
  mode: Mode;
  tasks: Task[];
  onToggleTask: (id: number) => void;
  messages: Message[];
  onSend: (text: string) => void;
  onOpenPalette: () => void;
  onToggleContext: () => void;
  streaming?: boolean;
}

const FOCUS_SECONDS = 50 * 60;

export default function CenterStage({
  mode, tasks, onToggleTask, messages, onSend, onOpenPalette, onToggleContext, streaming,
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
    if (mode === 'DEEP' || mode === 'RECEIVE') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const focusTime = `${Math.floor(focusSeconds / 60).toString().padStart(2, '0')}:${(focusSeconds % 60).toString().padStart(2, '0')}`;

  const showChat = mode === 'DEEP' || mode === 'RECEIVE';

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-nexus-bg relative">
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-100" />

      <div className="relative flex-1 overflow-y-auto">
        {mode === 'COMMAND' && (
          <Dashboard completed={completed} tasks={tasks} onToggleTask={onToggleTask} onOpenPalette={onOpenPalette} onToggleContext={onToggleContext} />
        )}

        {mode === 'FOCUS' && (
          <FocusView
            focusTime={focusTime}
            running={focusRunning}
            onToggle={() => setFocusRunning((r) => !r)}
            onReset={() => { setFocusSeconds(FOCUS_SECONDS); setFocusRunning(false); }}
          />
        )}

        {mode === 'PERFORMANCE' && <PerformanceView completed={completed} tasks={tasks} />}

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

function Dashboard({
  completed, tasks, onToggleTask, onOpenPalette, onToggleContext,
}: {
  completed: number; tasks: Task[]; onToggleTask: (id: number) => void;
  onOpenPalette: () => void; onToggleContext: () => void;
}) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-end justify-between gap-6 mb-7 flex-wrap">
        <div>
          <p className="text-nexus-dim font-mono text-[10px] tracking-widest mb-2">MONDAY · JULY 20</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-nexus-text">Good morning, Iyobosa.</h1>
          <p className="text-nexus-muted text-sm mt-2">Here's the shape of your day. <strong className="text-zinc-300 font-medium">Three decisions need your attention.</strong></p>
        </div>
        <button onClick={onOpenPalette} className="flex items-center gap-2 border border-nexus-border rounded-lg px-3 py-2 bg-nexus-mint/5 hover:border-nexus-mint/40 transition-colors">
          <span className="flex items-center gap-1.5 text-nexus-mint text-xs font-semibold"><Sparkles className="w-4 h-4" /> Daily brief</span>
          <small className="text-nexus-dim text-[10px]">Prepared by ATLAS · 3 min</small>
          <ArrowRight className="w-4 h-4 text-nexus-mint" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border border-nexus-border bg-nexus-border overflow-hidden mb-4">
        <Metric icon={<Target className="w-4 h-4" />} color={'nexus-orange' as const} value={`${completed}`} sub="/4" label="Priorities complete" tag="On track" />
        <Metric icon={<Clock3 className="w-4 h-4" />} color={'nexus-blue' as const} value="4.5" sub="h" label="Focus time protected" tag="2 blocks" />
        <Metric icon={<Radio className="w-4 h-4" />} color={'nexus-purple' as const} value="7" label="Signals to review" tag="+3 today" />
        <Metric icon={<Gauge className="w-4 h-4" />} color={'nexus-mint' as const} value="82" sub="%" label="System capacity" tag="Healthy" />
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
              <span className="flex items-center gap-1 text-[9px] font-mono text-nexus-mint border border-nexus-mint/20 rounded-full px-1.5 py-0.5"><i className="w-1 h-1 rounded-full bg-nexus-mint animate-pulse" /> 3 working</span>
            </div>
            <div className="p-2 space-y-1">
              {SIGNALS.slice(0, 3).map((s, i) => (
                <button key={s.title} onClick={onToggleContext} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/[.02] text-left">
                  <span className="w-7 h-7 rounded grid place-items-center font-mono text-[9px]" style={{ backgroundColor: `${['#38bdf8', '#fb923c', '#a78bfa'][i]}1a`, color: ['#38bdf8', '#fb923c', '#a78bfa'][i] }}>0{i + 1}</span>
                  <span className="min-w-0">
                    <strong className="block text-[10px] font-mono text-zinc-300 truncate">{s.label}</strong>
                    <small className="block text-[9px] text-nexus-dim truncate">{s.title}</small>
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
              {SIGNALS.map((s, i) => (
                <button key={s.title} className="w-full flex items-center gap-3 px-4 py-3 border-b border-nexus-border/40 text-left hover:bg-white/[.02] last:border-0">
                  <span className={`w-7 h-7 rounded grid place-items-center font-mono text-[9px] ${['text-nexus-blue bg-nexus-blue/10', 'text-nexus-orange bg-nexus-orange/10', 'text-nexus-purple bg-nexus-purple/10'][i]}`}>0{i + 1}</span>
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
            <span className="flex items-center gap-1.5 text-nexus-dim font-mono text-[10px] tracking-widest"><CalendarDays className="w-3.5 h-3.5" /> SCHEDULE</span>
            <h2 className="text-nexus-text text-sm font-semibold mt-1">Coming up</h2>
          </div>
          <span className="text-[10px] font-mono text-nexus-dim">BST</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono text-nexus-mint">NOW</span>
            <span className="h-px flex-1 bg-gradient-to-r from-nexus-mint/50 to-transparent" />
          </div>
          {SCHEDULE.map((ev) => (
            <div key={ev.time} className="flex items-center gap-4 py-2.5">
              <time className="text-[10px] font-mono text-nexus-dim w-10">{ev.time}</time>
              <span className={`w-1 h-8 rounded-full ${ev.kind === 'focus' ? 'bg-nexus-mint' : ev.kind === 'meeting' ? 'bg-nexus-blue' : 'bg-nexus-purple'}`} />
              <div className="min-w-0">
                <strong className="block text-[11px] font-medium text-zinc-300">{ev.title}</strong>
                <small className="block text-[10px] text-nexus-dim truncate">{ev.detail}</small>
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

function FocusView({ focusTime, running, onToggle, onReset }: { focusTime: string; running: boolean; onToggle: () => void; onReset: () => void }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center relative p-10 text-center overflow-hidden">
      <div className="absolute inset-[15%_10%] bg-[radial-gradient(circle,rgba(124,245,165,.09),transparent_58%)] pointer-events-none" />
      <div className="w-20 h-20 relative mb-6 border border-nexus-mint/20 rounded-full animate-[spin_18s_linear_infinite]">
        <div className="absolute inset-3 border border-nexus-mint/10 rounded-full" />
        <div className="absolute inset-7 bg-nexus-mint/10 rounded-full shadow-[0_0_28px_rgba(124,245,165,.18)]" />
      </div>
      <p className="text-nexus-mint/70 font-mono text-[10px] tracking-widest uppercase mb-3">Focus protocol</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-nexus-text">One thing, done well.</h1>
      <p className="text-nexus-muted text-sm mt-3">Review Placer.ai partnership brief</p>
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
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="w-full max-w-3xl mx-auto px-6 md:px-10 py-12">
      <h1 className="text-2xl font-semibold text-nexus-text mb-1">Performance</h1>
      <p className="text-nexus-muted text-sm mb-8">Execution telemetry for today.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">Priority completion</span>
          <div className="text-3xl font-mono text-nexus-mint mt-2">{pct}%</div>
          <div className="h-1.5 mt-3 rounded-full bg-nexus-border overflow-hidden"><span className="block h-full bg-nexus-mint" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">Focus protected</span>
          <div className="text-3xl font-mono text-nexus-blue mt-2">4.5h</div>
          <span className="text-[10px] text-nexus-dim">2 deep blocks</span>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/90 p-5">
          <span className="text-[10px] font-mono text-nexus-dim uppercase tracking-widest">System capacity</span>
          <div className="text-3xl font-mono text-nexus-purple mt-2">82%</div>
          <span className="text-[10px] text-nexus-dim">Healthy</span>
        </div>
      </div>
    </div>
  );
}
