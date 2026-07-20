import { useState, useEffect } from 'react';
import Topbar from './components/Topbar';
import LeftRail from './components/LeftRail';
import CenterStage from './components/CenterStage';
import RightRail from './components/RightRail';
import BottomBar from './components/BottomBar';
import CommandPalette from './components/CommandPalette';
import { Mode } from './types';

export default function App() {
  const [mode, setMode] = useState<Mode>('COMMAND');
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
      if (e.metaKey && e.key === 'm') {
        e.preventDefault();
        setMode(prev => prev === 'COMMAND' ? 'FOCUS' : 'COMMAND');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-nexus-bg text-nexus-text overflow-hidden font-sans selection:bg-nexus-mint/30">
      <Topbar mode={mode} setMode={setMode} />
      
      <div className="flex flex-1 overflow-hidden">
        {mode !== 'FOCUS' && mode !== 'DEEP' && <LeftRail />}
        
        <main className="flex-1 flex flex-col min-w-0 bg-nexus-bg/50 relative">
          <CenterStage mode={mode} />
        </main>
        
        {mode !== 'FOCUS' && <RightRail />}
      </div>
      
      <BottomBar onOpenCmd={() => setCmdOpen(true)} />
      
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
