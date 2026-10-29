import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Coffee, Moon, Zap, Compass, Headphones, Sparkles, X, SlidersHorizontal, Clock 
} from 'lucide-react';
import SmartModeModal from './SmartModeModal';

const LISTENING_MODES = [
  {
    id: 'Study',
    name: 'Study',
    icon: BookOpen,
    description: 'Calm, focus-friendly instrumentals & minimal lyrics',
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200 active:bg-indigo-100'
  },
  {
    id: 'Relax',
    name: 'Relax',
    icon: Coffee,
    description: 'Soothing acoustic, lo-fi, and tranquil melodies',
    color: 'text-teal-700 bg-teal-50 border-teal-200 active:bg-teal-100'
  },
  {
    id: 'Sleep',
    name: 'Sleep',
    icon: Moon,
    description: 'Deep calm soundscapes & peaceful ambient tracks',
    color: 'text-purple-700 bg-purple-50 border-purple-200 active:bg-purple-100'
  },
  {
    id: 'Workout',
    name: 'Workout',
    icon: Zap,
    description: 'High-energy, motivating dance, rock & upbeat rhythms',
    color: 'text-rose-700 bg-rose-50 border-rose-200 active:bg-rose-100'
  },
  {
    id: 'Travel',
    name: 'Travel',
    icon: Compass,
    description: 'Dynamic journey soundtracks & eclectic multi-genre variety',
    color: 'text-amber-700 bg-amber-50 border-amber-200 active:bg-amber-100'
  },
  {
    id: 'Chill',
    name: 'Chill',
    icon: Headphones,
    description: 'Laid-back grooves, indie pop, and mellow rhythms',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 active:bg-emerald-100'
  }
];

const ListeningModeSelector = ({ 
  activeMode, 
  selectedMode,
  onSelectMode, 
  setCurrentSong, 
  setQueue, 
  favorites = new Set(), 
  listeningHistory = [],
  currentSong,
  className = '' 
}) => {
  const [modalMode, setModalMode] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const currentMode = activeMode || selectedMode;

  // Lifted session timer countdown: persists even when modal is closed
  useEffect(() => {
    if (activeSession && activeSession.remainingSeconds > 0) {
      const interval = setInterval(() => {
        setActiveSession(prev => {
          if (!prev) return null;
          if (prev.remainingSeconds <= 1) {
            clearInterval(interval);
            if (prev.pauseAtEnd) {
              window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'PAUSE' } }));
              const audioEls = document.querySelectorAll('audio');
              audioEls.forEach(a => a.pause());
            }
            return { ...prev, remainingSeconds: 0, completed: true };
          }
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeSession?.remainingSeconds, activeSession?.pauseAtEnd]);

  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleChipClick = (modeId) => {
    // Open dedicated configuration modal as required in Feature 3
    setModalMode(modeId);
  };

  const handleSessionStarted = (sessionInfo) => {
    if (onSelectMode) {
      onSelectMode(sessionInfo.mode);
    }
    if (sessionInfo.duration > 0) {
      setActiveSession({
        mode: sessionInfo.mode,
        durationMinutes: sessionInfo.duration,
        remainingSeconds: sessionInfo.duration * 60,
        pauseAtEnd: sessionInfo.pauseAtEnd,
        focus: sessionInfo.focus,
        trackCount: sessionInfo.trackCount
      });
    } else {
      setActiveSession({
        mode: sessionInfo.mode,
        durationMinutes: 0,
        remainingSeconds: 0,
        pauseAtEnd: false,
        focus: sessionInfo.focus,
        trackCount: sessionInfo.trackCount
      });
    }
  };

  const handleClearMode = () => {
    if (onSelectMode) onSelectMode(null);
    setActiveSession(null);
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-mood-cobalt" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-mood-forest">
            Smart Listening Purpose
          </span>
          {currentMode && (
            <span className="text-[11px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-2.5 py-0.5 rounded-full border border-mood-cobalt/20">
              {currentMode} Mode Active
            </span>
          )}
          {activeSession && activeSession.remainingSeconds > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-2.5 py-0.5 rounded-full border border-mood-cobalt/20 shadow-xs">
              <Clock className="w-3 h-3 animate-pulse" />
              <span>{formatTimer(activeSession.remainingSeconds)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentMode && (
            <button
              type="button"
              onClick={() => setModalMode(currentMode)}
              className="text-[11px] font-bold text-mood-cobalt hover:underline flex items-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" /> Options
            </button>
          )}

          {currentMode && (
            <button
              type="button"
              onClick={handleClearMode}
              className="text-[11px] font-bold text-mood-black/50 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear Mode
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {LISTENING_MODES.map((mode) => {
          const isActive = currentMode === mode.id;
          const IconComp = mode.icon;

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleChipClick(mode.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 border cursor-pointer ${
                isActive
                  ? 'bg-mood-forest text-mood-lime border-mood-forest shadow-sm scale-102'
                  : 'bg-white text-mood-forest/75 border-mood-black/10 hover:border-mood-forest/30 hover:bg-mood-black/[0.02]'
              }`}
              title={mode.description}
            >
              <IconComp className={`w-3.5 h-3.5 ${isActive ? 'text-mood-lime' : 'text-mood-cobalt'}`} />
              <span>{mode.name}</span>
            </button>
          );
        })}
      </div>

      {currentMode && (
        <p className="text-[11px] text-mood-black/60 italic pl-1">
          {LISTENING_MODES.find(m => m.id === currentMode)?.description}
        </p>
      )}

      {/* Mode Configuration & Session Modal */}
      {modalMode && (
        <SmartModeModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          setCurrentSong={setCurrentSong}
          setQueue={setQueue}
          favorites={favorites}
          listeningHistory={listeningHistory}
          currentSong={currentSong}
          activeSession={activeSession}
          onSessionStart={handleSessionStarted}
        />
      )}
    </div>
  );
};

export default ListeningModeSelector;
