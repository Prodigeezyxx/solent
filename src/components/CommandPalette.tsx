import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Calendar, FileText, Bot, User, CheckCircle2, ChevronRight, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

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
          transition={{ type: "spring", bounce: 0, duration: 0.2 }}
          className="relative w-full max-w-2xl bg-nexus-bg border border-nexus-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center px-4 py-4 border-b border-nexus-border">
            <Search className="w-5 h-5 text-nexus-mint mr-3" />
            <input 
              ref={inputRef}
              className="flex-1 bg-transparent border-none outline-none text-lg text-white font-sans placeholder:text-nexus-dim"
              placeholder="Command NEXUS..."
            />
            <button 
              onClick={onClose}
              className="text-nexus-dim hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            <div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-nexus-dim uppercase mb-1">
              Top Actions
            </div>
            
            <button className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-nexus-border/30 group transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-nexus-border/50 flex items-center justify-center text-nexus-mint">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-nexus-mint transition-colors">Capture Task</div>
                  <div className="text-xs text-nexus-dim">Route to ATLAS for scheduling</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-nexus-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            
            <button className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-nexus-border/30 group transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-nexus-border/50 flex items-center justify-center text-[#7CFFB2]">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-[#7CFFB2] transition-colors">Focus Mode</div>
                  <div className="text-xs text-nexus-dim">ATLAS: Block next 2 hours</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-nexus-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            
            <button className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-nexus-border/30 group transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-nexus-border/50 flex items-center justify-center text-[#fb923c]">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-[#fb923c] transition-colors">Find Person</div>
                  <div className="text-xs text-nexus-dim">HUNTER / CIRCLE: Search network graph</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-nexus-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-nexus-border/30 group transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-nexus-border/50 flex items-center justify-center text-[#a78bfa]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-[#a78bfa] transition-colors">Draft Comms</div>
                  <div className="text-xs text-nexus-dim">HERMES: Generate an email or message</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-nexus-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <div className="px-2 py-1.5 text-[10px] font-mono tracking-widest text-nexus-dim uppercase mt-4 mb-1 border-t border-nexus-border/50 pt-4">
              Agent Control
            </div>

            <button className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-nexus-border/30 group transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-nexus-border/50 flex items-center justify-center text-[#c084fc]">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-[#c084fc] transition-colors">Invoke JUDGE</div>
                  <div className="text-xs text-nexus-dim">Log a new decision or review past decisions</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-nexus-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
          
          <div className="px-4 py-2 bg-nexus-dark/50 border-t border-nexus-border flex items-center justify-between text-[10px] font-mono text-nexus-dim">
            <span>Use ↑↓ to navigate</span>
            <span>Press Esc to close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
