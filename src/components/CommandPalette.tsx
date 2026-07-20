import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Calendar, FileText, Bot, User, CheckCircle2, ChevronRight, X } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
  action: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

const ITEMS: CommandItem[] = [
  { id: 'capture', label: 'Capture Task', hint: 'Route to ATLAS for scheduling', icon: <CheckCircle2 className="w-4 h-4" />, color: '#b9f6ca', action: 'capture' },
  { id: 'focus', label: 'Focus Mode', hint: 'ATLAS: Block next 2 hours', icon: <Calendar className="w-4 h-4" />, color: '#7CFFB2', action: 'focus' },
  { id: 'person', label: 'Find Person', hint: 'HUNTER / CIRCLE: Search network graph', icon: <User className="w-4 h-4" />, color: '#fb923c', action: 'person' },
  { id: 'comms', label: 'Draft Comms', hint: 'HERMES: Generate an email or message', icon: <FileText className="w-4 h-4" />, color: '#a78bfa', action: 'comms' },
  { id: 'judge', label: 'Invoke JUDGE', hint: 'Log a new decision or review past decisions', icon: <Bot className="w-4 h-4" />, color: '#c084fc', action: 'judge' },
];

export default function CommandPalette({ isOpen, onClose, onAction }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = ITEMS.filter((item) =>
    `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[active];
        if (item) onAction(item.action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filtered, active, onAction]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
          className="relative w-full max-w-2xl bg-nexus-bg border border-nexus-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center px-4 py-4 border-b border-nexus-border">
            <Search className="w-5 h-5 text-nexus-mint mr-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-lg text-white font-sans placeholder:text-nexus-dim"
              placeholder="Command NEXUS..."
            />
            <button onClick={onClose} className="text-nexus-dim hover:text-white transition-colors p-1" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            <div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-nexus-dim uppercase mb-1">
              Top Actions
            </div>

            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-nexus-dim">No matching command.</div>
            )}

            {filtered.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onAction(item.action)}
                onMouseEnter={() => setActive(index)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg group transition-colors text-left ${
                  active === index ? 'bg-nexus-border/40' : 'hover:bg-nexus-border/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{ backgroundColor: `${item.color}1a`, color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-nexus-mint transition-colors">
                      {item.label}
                    </div>
                    <div className="text-xs text-nexus-dim">{item.hint}</div>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-nexus-dim transition-opacity ${
                    active === index ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="px-4 py-2 bg-nexus-surface/50 border-t border-nexus-border flex items-center justify-between text-[10px] font-mono text-nexus-dim">
            <span>Use ↑↓ to navigate</span>
            <span>Press Esc to close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
