import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import type { AgentRole, Message, Mode, Task } from './types';
import { AGENTS, TASKS } from './data/agents';
import {
  createTaskRemote, fetchBrief, fetchTasks, runBriefNow, streamChat, toggleTaskRemote,
  type Brief, type ToolEvent,
} from './lib/api';
import Topbar from './components/Topbar';
import LeftRail from './components/LeftRail';
import CenterStage from './components/CenterStage';
import RightRail from './components/RightRail';
import BottomBar from './components/BottomBar';
import CommandPalette from './components/CommandPalette';
import SourcesModal from './components/SourcesModal';
import AgentPane from './components/AgentPane';

const MODE_VIEWS: Record<Mode, string> = {
  COMMAND: 'Command centre',
  FOCUS: 'Focus protocol',
  RECEIVE: 'Inbox & signals',
  GRAPH: 'Knowledge graph',
  DEEP: 'CONDUCTOR thread',
  PERFORMANCE: 'Performance',
};

function App() {
  const [mode, setMode] = useState<Mode>('COMMAND');
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefRunning, setBriefRunning] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>('ATLAS');
  const [agentPaneOpen, setAgentPaneOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'CONDUCTOR',
      content: 'CONDUCTOR online. Connect your sources, then ask me to run the brief, capture a task, or log a decision.',
      timestamp: new Date(),
    },
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const refreshTasks = useCallback(async () => {
    try {
      const remote = await fetchTasks();
      if (remote.length) setTasks(remote.map((t) => ({ ...t, done: !!t.done, priority: !!t.priority })));
    } catch {
      /* worker offline — keep seeded tasks */
    }
  }, []);

  // Boot: load real tasks + the cached brief (GET path — zero credits).
  // Then keep it LIVE: re-poll every 3 minutes (and on tab refocus). The
  // worker's stale-while-revalidate path re-pulls sources for free, so a new
  // Zoho/Gmail/Pumble item is never invisible for more than a few minutes.
  useEffect(() => {
    refreshTasks();
    const pull = () =>
      fetchBrief()
        .then((b) => {
          setBrief(b);
          refreshTasks();
        })
        .catch(() => {
          /* worker offline — UI still usable */
        });
    pull();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, 3 * 60_000);
    const onFocus = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshTasks]);

  // The ONE-SHOT pass: pull Pumble + Gmail + Zoho, one model call, done.
  const runBrief = useCallback(async () => {
    setBriefRunning(true);
    setToast('CONDUCTOR running the one-shot pass…');
    try {
      const b = await runBriefNow();
      setBrief(b);
      await refreshTasks();
      setToast(
        b.error
          ? `Sources pulled, triage failed: ${b.error.slice(0, 60)}`
          : `Brief ready · ${b.priorities.length} priorities · ${b.inbox.length} items scanned`,
      );
    } catch {
      setToast('Brief failed — is the Worker running?');
    } finally {
      setBriefRunning(false);
    }
  }, [refreshTasks]);

  const addTask = async (title: string) => {
    try {
      await createTaskRemote(title, 'manual');
      await refreshTasks();
      setToast('Task added to the queue');
    } catch {
      setToast('Could not add task — is the Worker running?');
    }
  };

  const toggleTask = async (id: number) => {
    // Optimistic local update, then reconcile with the backend.
    setTasks((items) => items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    try {
      const updated = await toggleTaskRemote(id);
      setTasks((items) => items.map((t) => (t.id === id ? { ...t, done: updated.done, priority: updated.priority } : t)));
    } catch {
      setToast('Could not reach the council — is the Worker running?');
    }
  };

  const sendMessage = (text: string) => {
    if (mode !== 'DEEP') setMode('DEEP'); // conversation lives in the CONDUCTOR thread
    const userMsg: Message = { id: Date.now().toString(), sender: 'USER', content: text, timestamp: new Date() };
    const history: Message[] = [...messages, userMsg];
    setMessages(history);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, sender: 'CONDUCTOR', content: '', timestamp: new Date() }]);

    streamChat(
      history.map((m) => ({ role: m.sender === 'USER' ? 'user' : 'assistant', agent: m.sender, content: m.content })),
      {
        onTool: (tool: ToolEvent) => {
          setToast(`${tool.agent} · ${tool.action}`);
          // A captured/changed task means the queue changed server-side — refetch it.
          if (tool.action.toLowerCase().includes('task')) refreshTasks();
        },
        onReply: ({ content }) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)));
        },
        onDone: () => setStreaming(false),
        onError: (err) => {
          setStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `The council is unreachable (${err.message}). Start the Worker with \`wrangler dev\`.` }
                : m,
            ),
          );
        },
      },
    );
  };

  const runCommand = (action: string) => {
    setPaletteOpen(false);
    setAgentPaneOpen(false);
    if (action === 'focus') setMode('FOCUS');
    else if (action === 'capture') setToast('Capture ready — type in the command bar');
    else if (action === 'graph' || action === 'person') setMode('GRAPH');
    else if (action === 'comms') setToast('HERMES is drafting your message');
    else if (action === 'judge') setToast('JUDGE decision journal opened');
    else if (action === 'sources') setSourcesOpen(true);
    else runBrief();
  };

  const selectedAgentData = AGENTS.find((a) => a.id === selectedAgent) ?? AGENTS[1];
  const completed = tasks.filter((t) => t.done).length;

  return (
    <div className="h-screen flex flex-col bg-solent-bg text-solent-text overflow-hidden">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <Topbar mode={mode} setMode={(m) => { setAgentPaneOpen(false); setMode(m); }} onOpenPalette={() => setPaletteOpen(true)} />

      <div className="flex-1 flex min-h-0">
        <LeftRail
          agents={AGENTS}
          selectedAgent={selectedAgent}
          onSelectAgent={(id) => {
            setSelectedAgent(id);
            setAgentPaneOpen(true);
          }}
        />

        <main id="main-content" className="flex-1 min-w-0 flex flex-col" aria-label={MODE_VIEWS[mode]}>
          {agentPaneOpen ? (
            <AgentPane
              agent={selectedAgentData}
              onClose={() => setAgentPaneOpen(false)}
              onToast={setToast}
            />
          ) : (
            <CenterStage
              mode={mode}
              tasks={tasks}
              onToggleTask={toggleTask}
              onAddTask={addTask}
              messages={messages}
              onSend={sendMessage}
              onOpenPalette={() => setPaletteOpen(true)}
              onToggleContext={() => setContextOpen((o) => !o)}
              streaming={streaming}
              brief={brief}
              briefRunning={briefRunning}
              onRunBrief={runBrief}
              onOpenSources={() => setSourcesOpen(true)}
            />
          )}
        </main>

        <RightRail agent={selectedAgentData} open={contextOpen} onClose={() => setContextOpen(false)} brief={brief} />
      </div>

      <BottomBar
        onOpenCmd={() => setPaletteOpen(true)}
        prioritiesDone={completed}
        prioritiesTotal={tasks.length}
        refreshKey={brief?.generated_at}
        onOpenLedger={() => { setSelectedAgent('LEDGER'); setAgentPaneOpen(true); }}
      />

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={runCommand} />

      <SourcesModal
        isOpen={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        sources={brief?.sources}
        onSaved={() => fetchBrief().then(setBrief).catch(() => undefined)}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed right-4 bottom-12 z-[120] flex items-center gap-2 px-3 py-2.5 border border-solent-border rounded-lg bg-solent-surface text-solent-muted text-xs shadow-2xl"
          >
            <CheckCircle2 className="w-4 h-4 text-solent-mint" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
