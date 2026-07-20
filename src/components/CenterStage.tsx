import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Mic, Terminal, ChevronRight, Hash, Send } from 'lucide-react';
import { Mode, Message } from '../types';

interface CenterStageProps {
  mode: Mode;
}

export default function CenterStage({ mode }: CenterStageProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'CONDUCTOR',
      content: 'Good morning, Iyobosa. ATLAS has prepared the 7AM huddle. ORACLE has 2 new signals regarding Placer.ai. Where should we start?',
      timestamp: new Date()
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'USER',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    
    // Simulate conductor routing
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'CONDUCTOR',
        content: `Routing to SCRIBE to log the note. Engaging ATLAS to update priorities.`,
        timestamp: new Date()
      }]);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a]">
      {/* Feed area */}
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

      {/* Input area - The Scratchpad */}
      <div className="p-4 md:p-8 bg-gradient-to-t from-nexus-bg via-nexus-bg to-transparent">
        <div className="max-w-3xl mx-auto">
          <form 
            onSubmit={handleSubmit}
            className="relative bg-nexus-dark/80 border border-nexus-border rounded-lg shadow-2xl backdrop-blur-xl group focus-within:border-nexus-mint/50 transition-colors"
          >
            <div className="flex items-center px-4 py-3">
              <ChevronRight className="w-5 h-5 text-nexus-mint mr-2 shrink-0" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Command CONDUCTOR, or press Space to dictate..."
                className="flex-1 bg-transparent border-none outline-none text-zinc-100 placeholder:text-nexus-dim font-sans text-sm md:text-base"
                autoFocus
              />
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className="p-2 text-nexus-dim hover:text-nexus-mint transition-colors rounded-md hover:bg-nexus-border/50">
                  <Mic className="w-4 h-4" />
                </button>
                <button type="button" className="p-2 text-nexus-dim hover:text-nexus-text transition-colors rounded-md hover:bg-nexus-border/50">
                  <Hash className="w-4 h-4" />
                </button>
                <button type="submit" disabled={!input.trim()} className="p-2 text-nexus-mint disabled:text-nexus-dim disabled:opacity-50 transition-colors rounded-md hover:bg-nexus-mint/10">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Context hints below input */}
            <div className="px-4 py-2 border-t border-nexus-border/50 flex items-center justify-between text-[10px] font-mono text-nexus-dim bg-black/20 rounded-b-lg">
              <div className="flex items-center gap-4">
                <span><kbd className="bg-nexus-border px-1 rounded">⌘K</kbd> Palette</span>
                <span><kbd className="bg-nexus-border px-1 rounded">Space</kbd> Voice</span>
                <span><kbd className="bg-nexus-border px-1 rounded">/</kbd> Commands</span>
              </div>
              <div className="flex items-center gap-2 text-nexus-mint/70">
                <Terminal className="w-3 h-3" />
                <span>NEXUS v0.1</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
