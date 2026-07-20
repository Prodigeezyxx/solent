import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity, Archive, ArrowRight, Bell, BrainCircuit, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, Command, CornerDownLeft,
  FileText, Focus, Gauge, Inbox, LayoutGrid, Menu, MessageSquareText, Mic,
  Network, Plus, Radio, Search, Send, Settings2, Sparkles, Target, TimerReset,
  TrendingUp, Users, WandSparkles, X, Zap,
} from 'lucide-react';

type Mode = 'Command' | 'Focus' | 'Receive' | 'Deep work';
type AgentStatus = 'working' | 'ready' | 'watching';

type Agent = {
  name: string;
  role: string;
  status: AgentStatus;
  color: string;
  task?: string;
};

type Task = {
  id: number;
  title: string;
  context: string;
  time: string;
  done: boolean;
  priority?: boolean;
};

const agents: Agent[] = [
  { name: 'ATLAS', role: 'Chief of staff', status: 'working', color: '#b9f6ca', task: 'Sequencing today' },
  { name: 'ORACLE', role: 'Signal intelligence', status: 'watching', color: '#91d8ff', task: '2 new signals' },
  { name: 'SCRIBE', role: 'Memory & synthesis', status: 'ready', color: '#d2c6ff' },
  { name: 'HERMES', role: 'Communication', status: 'ready', color: '#ffcf9d' },
  { name: 'HUNTER', role: 'Growth radar', status: 'watching', color: '#ff9f9f', task: '3 warm paths' },
  { name: 'FORGE', role: 'Product builder', status: 'ready', color: '#ffe57c' },
  { name: 'LEDGER', role: 'Metrics & finance', status: 'ready', color: '#8fe8c2' },
];

const initialTasks: Task[] = [
  { id: 1, title: 'Review Placer.ai partnership brief', context: 'realmspace · ORACLE', time: '09:30', done: false, priority: true },
  { id: 2, title: 'Approve Expo outreach sequence', context: 'Floats XR · HERMES', time: '11:00', done: false, priority: true },
  { id: 3, title: 'Send revised board metrics', context: 'realmspace · LEDGER', time: '14:30', done: false, priority: true },
  { id: 4, title: 'Capture venue pricing insight', context: 'Inbox · SCRIBE', time: 'Anytime', done: true },
];

const signals = [
  { label: 'Market', title: 'Location intelligence demand is moving upmarket', meta: 'ORACLE · 18 min ago', score: '91%' },
  { label: 'Network', title: 'Warm path found to Momentum Worldwide', meta: 'HUNTER · 42 min ago', score: '87%' },
  { label: 'Product', title: 'Booth-as-a-service pattern repeated across 4 calls', meta: 'SCRIBE · Yesterday', score: '83%' },
];

const commands = [
  { icon: Plus, label: 'Capture a thought', hint: 'Route to SCRIBE', action: 'capture' },
  { icon: Focus, label: 'Start focus mode', hint: 'Block distractions for 50 minutes', action: 'focus' },
  { icon: Search, label: 'Search the knowledge graph', hint: 'People, projects, decisions, notes', action: 'search' },
  { icon: WandSparkles, label: 'Prepare my daily brief', hint: 'Ask ATLAS to synthesize priorities', action: 'brief' },
];

function AgentMark({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`agent-mark ${size}`} style={{ '--agent': color } as CSSProperties} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('Command');
  const [tasks, setTasks] = useState(initialTasks);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [rightPanel, setRightPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('ATLAS');
  const [composer, setComposer] = useState('');
  const [toast, setToast] = useState('');
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(50 * 60);
  const paletteInput = useRef<HTMLInputElement>(null);

  const completed = tasks.filter((task) => task.done).length;
  const filteredCommands = commands.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(paletteQuery.toLowerCase()));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileNav(false);
        setRightPanel(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => paletteInput.current?.focus(), 50);
  }, [paletteOpen]);

  useEffect(() => {
    if (!focusRunning || focusSeconds <= 0) return;
    const timer = window.setInterval(() => setFocusSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning, focusSeconds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const focusTime = useMemo(() => {
    const minutes = Math.floor(focusSeconds / 60).toString().padStart(2, '0');
    const seconds = (focusSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [focusSeconds]);

  const toggleTask = (id: number) => setTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done } : task));

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === 'Focus') setFocusRunning(true);
    setMobileNav(false);
  };

  const executeCommand = (action: string) => {
    setPaletteOpen(false);
    setPaletteQuery('');
    if (action === 'focus') switchMode('Focus');
    else if (action === 'capture') setToast('Capture ready — type in the command bar');
    else if (action === 'search') setToast('Knowledge graph indexed · 12,481 nodes');
    else setToast('ATLAS is preparing your daily brief');
  };

  const submitComposer = (event: FormEvent) => {
    event.preventDefault();
    if (!composer.trim()) return;
    setToast(`CONDUCTOR routed “${composer.slice(0, 32)}${composer.length > 32 ? '…' : ''}”`);
    setComposer('');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <button className="brand" onClick={() => switchMode('Command')} aria-label="Nexus home">
            <span className="brand-glyph"><span /></span>
            <span>NEXUS</span>
          </button>
          <span className="workspace-switcher">Iyobosa's workspace <ChevronDown size={13} /></span>
        </div>

        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={15} />
          <span>Search, ask or run a command</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="top-actions">
          <span className="system-status"><i /> Systems nominal</span>
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up')}>
            <Bell size={17} /><b>2</b>
          </button>
          <button className="avatar" aria-label="Open profile">IO</button>
        </div>
      </header>

      <div className="workspace">
        <AnimatePresence>
          {mobileNav && (
            <motion.button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
        </AnimatePresence>

        <nav className={`left-nav ${mobileNav ? 'is-open' : ''}`} aria-label="Primary navigation">
          <div className="mobile-nav-head">
            <span className="eyebrow">Workspace</span>
            <button className="icon-button" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button>
          </div>

          <div className="nav-section mode-nav">
            <p className="nav-label">Modes</p>
            {([
              ['Command', LayoutGrid], ['Focus', Focus], ['Receive', Inbox], ['Deep work', BrainCircuit],
            ] as [Mode, typeof LayoutGrid][]).map(([label, Icon]) => (
              <button key={label} className={mode === label ? 'nav-item active' : 'nav-item'} onClick={() => switchMode(label)}>
                <Icon size={16} /><span>{label}</span>{label === 'Receive' && <em>7</em>}
              </button>
            ))}
          </div>

          <div className="nav-section">
            <div className="nav-section-heading"><p className="nav-label">Agent council</p><button aria-label="Agent settings"><Settings2 size={13} /></button></div>
            <div className="agent-list">
              {agents.map((agent) => (
                <button key={agent.name} className={selectedAgent === agent.name ? 'agent-row selected' : 'agent-row'} onClick={() => { setSelectedAgent(agent.name); setToast(`${agent.name} context loaded`); }}>
                  <AgentMark name={agent.name} color={agent.color} />
                  <span><strong>{agent.name}</strong><small>{agent.role}</small></span>
                  <i className={agent.status} aria-label={agent.status} />
                </button>
              ))}
            </div>
          </div>

          <div className="nav-bottom">
            <button className="nav-item"><Archive size={16} /><span>Knowledge vault</span></button>
            <button className="nav-item"><Network size={16} /><span>Relationship graph</span></button>
            <div className="usage-card">
              <div><Sparkles size={14} /><span>Collective capacity</span><strong>82%</strong></div>
              <span className="usage-track"><i /></span>
              <small>12 agents · 3 active now</small>
            </div>
          </div>
        </nav>

        <main className="main-stage" id="main-content">
          {mode === 'Focus' ? (
            <section className="focus-view" aria-labelledby="focus-heading">
              <div className="focus-orbit"><span /><span /><span /></div>
              <p className="eyebrow mint">Focus protocol</p>
              <h1 id="focus-heading">One thing, done well.</h1>
              <p>Review Placer.ai partnership brief</p>
              <div className="focus-clock">{focusTime}</div>
              <div className="focus-controls">
                <button className="primary-button" onClick={() => setFocusRunning((running) => !running)}>{focusRunning ? 'Pause session' : 'Resume session'}</button>
                <button className="secondary-button" onClick={() => { setFocusSeconds(50 * 60); setFocusRunning(false); }}>Reset</button>
              </div>
              <button className="text-button" onClick={() => switchMode('Command')}>Exit focus mode</button>
            </section>
          ) : (
            <div className="dashboard-wrap">
              <section className="welcome-row" aria-labelledby="welcome-heading">
                <div>
                  <p className="date-line">MONDAY · JULY 20</p>
                  <h1 id="welcome-heading">Good morning, Iyobosa.</h1>
                  <p>Here’s the shape of your day. <strong>Three decisions need your attention.</strong></p>
                </div>
                <button className="daily-brief" onClick={() => setToast('Opening ATLAS daily brief')}>
                  <span><Sparkles size={16} /> Daily brief</span>
                  <small>Prepared by ATLAS · 3 min read</small>
                  <ArrowRight size={17} />
                </button>
              </section>

              <section className="metric-strip" aria-label="Daily metrics">
                <article><span className="metric-icon warm"><Target size={16} /></span><div><strong>{completed}<small>/4</small></strong><span>Priorities complete</span></div><em>On track</em></article>
                <article><span className="metric-icon blue"><Clock3 size={16} /></span><div><strong>4.5<small>h</small></strong><span>Focus time protected</span></div><em>2 blocks</em></article>
                <article><span className="metric-icon purple"><Radio size={16} /></span><div><strong>7</strong><span>Signals to review</span></div><em>+3 today</em></article>
                <article><span className="metric-icon green"><Gauge size={16} /></span><div><strong>82<small>%</small></strong><span>System capacity</span></div><em>Healthy</em></article>
              </section>

              <div className="content-grid">
                <section className="panel priorities-panel" aria-labelledby="priorities-heading">
                  <div className="panel-heading">
                    <div><span className="section-kicker"><Target size={14} /> TODAY</span><h2 id="priorities-heading">Priority queue</h2></div>
                    <button className="subtle-button" onClick={() => setToast('New priority created')}><Plus size={14} /> Add</button>
                  </div>
                  <div className="task-list">
                    {tasks.map((task) => (
                      <motion.article layout key={task.id} className={task.done ? 'task-row complete' : 'task-row'}>
                        <button className="task-check" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}>
                          {task.done ? <Check size={13} /> : <Circle size={16} />}
                        </button>
                        <button className="task-copy" onClick={() => setToast(`Opening: ${task.title}`)}>
                          <strong>{task.title}</strong><span>{task.context}</span>
                        </button>
                        <time>{task.time}</time>
                        <ChevronRight className="task-arrow" size={15} />
                      </motion.article>
                    ))}
                  </div>
                  <div className="panel-footer">
                    <span><CheckCircle2 size={14} /> {completed} of {tasks.length} completed</span>
                    <button onClick={() => setToast('Timeline opened')}>View timeline <ArrowRight size={13} /></button>
                  </div>
                </section>

                <section className="panel agent-activity-panel" aria-labelledby="activity-heading">
                  <div className="panel-heading">
                    <div><span className="section-kicker"><Activity size={14} /> LIVE</span><h2 id="activity-heading">Agent activity</h2></div>
                    <span className="live-pill"><i /> 3 working</span>
                  </div>
                  <div className="activity-list">
                    {agents.filter((agent) => agent.task).map((agent, index) => (
                      <button key={agent.name} onClick={() => { setSelectedAgent(agent.name); setRightPanel(true); }}>
                        <AgentMark name={agent.name} color={agent.color} />
                        <span><strong>{agent.name}</strong><small>{agent.task}</small></span>
                        {index === 0 ? <span className="pulse-bars"><i /><i /><i /></span> : <span className="activity-time">{index * 8 + 4}m</span>}
                      </button>
                    ))}
                  </div>
                  <button className="ask-council" onClick={() => setPaletteOpen(true)}><Users size={15} /> Ask the council <ArrowRight size={14} /></button>
                </section>

                <section className="panel signals-panel" aria-labelledby="signals-heading">
                  <div className="panel-heading">
                    <div><span className="section-kicker"><TrendingUp size={14} /> SIGNAL RADAR</span><h2 id="signals-heading">What changed</h2></div>
                    <button className="subtle-button" onClick={() => setToast('All signals marked reviewed')}>Mark reviewed</button>
                  </div>
                  <div className="signal-list">
                    {signals.map((signal, index) => (
                      <button key={signal.title} onClick={() => setToast(`Signal ${index + 1} opened`)}>
                        <span className={`signal-index s${index}`}>0{index + 1}</span>
                        <span className="signal-copy"><small>{signal.label}</small><strong>{signal.title}</strong><em>{signal.meta}</em></span>
                        <span className="confidence"><small>confidence</small><strong>{signal.score}</strong></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel schedule-panel" aria-labelledby="schedule-heading">
                  <div className="panel-heading">
                    <div><span className="section-kicker"><CalendarDays size={14} /> SCHEDULE</span><h2 id="schedule-heading">Coming up</h2></div>
                    <span className="timezone">BST</span>
                  </div>
                  <div className="now-line"><span>NOW</span><i /></div>
                  <div className="event-list">
                    <article><time>10:00</time><span className="event-bar focus" /><div><strong>Deep work block</strong><small>Placer.ai partnership brief · 50m</small></div></article>
                    <article><time>11:30</time><span className="event-bar meeting" /><div><strong>Floats XR product sync</strong><small>4 attendees · Google Meet</small></div></article>
                    <article><time>14:30</time><span className="event-bar admin" /><div><strong>Board metrics review</strong><small>with LEDGER · 30m</small></div></article>
                  </div>
                </section>
              </div>
            </div>
          )}

          <form className="command-composer" onSubmit={submitComposer}>
            <span className="conductor-glyph"><Sparkles size={16} /></span>
            <input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Ask CONDUCTOR anything, or capture a thought…" aria-label="Command CONDUCTOR" />
            <button type="button" className="composer-icon" aria-label="Start voice input" onClick={() => setToast('Voice capture is ready')}><Mic size={16} /></button>
            <button type="submit" className="send-button" disabled={!composer.trim()} aria-label="Send command"><Send size={15} /></button>
          </form>
        </main>

        <aside className={`context-rail ${rightPanel ? 'is-open' : ''}`} aria-label="Context panel">
          <div className="context-head">
            <div><span className="eyebrow">Active context</span><strong>{selectedAgent}</strong></div>
            <button className="icon-button" onClick={() => setRightPanel(false)} aria-label="Close context panel"><X size={17} /></button>
          </div>
          <div className="context-agent">
            <AgentMark name={selectedAgent} color={agents.find((agent) => agent.name === selectedAgent)?.color || '#b9f6ca'} />
            <div><strong>{selectedAgent}</strong><span>{agents.find((agent) => agent.name === selectedAgent)?.role}</span></div>
            <span className="ready-badge">READY</span>
          </div>
          <div className="context-section">
            <h3>Working context</h3>
            <button className="context-card"><FileText size={15} /><span><strong>Placer.ai partnership</strong><small>Project · updated 18m ago</small></span></button>
            <button className="context-card"><Network size={15} /><span><strong>Enterprise growth thesis</strong><small>Decision · confidence 84%</small></span></button>
          </div>
          <div className="context-section">
            <h3>Recent memory</h3>
            <blockquote>“Agencies will resell better than direct — package the operational layer, not just the hardware.”<footer>Captured by SCRIBE · Jul 18</footer></blockquote>
          </div>
          <div className="context-section">
            <h3>Connected people</h3>
            <div className="people-stack"><span>BC</span><span>AK</span><span>JM</span><small>+8 in graph</small></div>
          </div>
          <button className="context-action" onClick={() => setToast(`${selectedAgent} has joined the thread`)}><MessageSquareText size={15} /> Open thread with {selectedAgent}</button>
        </aside>
      </div>

      <footer className="status-bar">
        <button onClick={() => setPaletteOpen(true)}><Command size={13} /> Command palette <kbd>⌘K</kbd></button>
        <span><i className="sync-dot" /> Graph synced <b>just now</b></span>
        <span className="status-spacer" />
        <button onClick={() => setRightPanel(true)}><Network size={13} /> 12,481 nodes</button>
        <span><Zap size={13} /> Energy <b>High</b></span>
      </footer>

      <AnimatePresence>
        {paletteOpen && (
          <motion.div className="palette-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="palette-backdrop" onClick={() => setPaletteOpen(false)} aria-label="Close command palette" />
            <motion.section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" initial={{ y: -16, scale: .98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -10, scale: .98, opacity: 0 }}>
              <div className="palette-input"><Search size={18} /><input ref={paletteInput} value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="What do you want to do?" /><kbd>ESC</kbd></div>
              <div className="palette-body">
                <p>Suggested</p>
                {filteredCommands.map((item, index) => {
                  const Icon = item.icon;
                  return <button key={item.label} onClick={() => executeCommand(item.action)} className={index === 0 ? 'highlighted' : ''}><span className="command-icon"><Icon size={17} /></span><span><strong>{item.label}</strong><small>{item.hint}</small></span><CornerDownLeft size={14} /></button>;
                })}
                {!filteredCommands.length && <div className="empty-command">No exact match. Press enter to ask CONDUCTOR.</div>}
              </div>
              <footer><span><i /> CONDUCTOR online</span><span><kbd>↑↓</kbd> Navigate <kbd>↵</kbd> Select</span></footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><CheckCircle2 size={16} /> {toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

export default App;
