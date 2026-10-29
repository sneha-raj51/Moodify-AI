import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Sparkles, Play, Clock, Sliders, CheckCircle2, 
  AlertCircle, HelpCircle, ArrowLeft, Loader, Volume2, 
  RotateCcw, Pause, Timer
} from 'lucide-react';
import SongCover from './SongCover';
import WhyThisSongModal from './WhyThisSongModal';
import { getAiRecommendations } from '../services/api';

const MODE_CONFIGS = {
  Study: {
    title: 'Study Mode Configuration',
    description: 'Optimize your sonic environment for cognitive retention, coding, and sustained focus.',
    targetMood: 'Calm',
    focusTypes: ['Deep Focus', 'Light Study', 'Reading', 'Coding', 'Exam Preparation'],
    musicStyles: ['Lo-fi', 'Instrumental', 'Classical', 'Ambient', 'Soft Piano'],
    vocals: ['Instrumental Only', 'Minimal Vocals', 'Vocals Allowed'],
    durations: [
      { label: '15 min', value: 15 },
      { label: '25 min (Pomodoro)', value: 25 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Low', 'Medium', 'High']
  },
  Relax: {
    title: 'Relax Mode Configuration',
    description: 'De-stress your nervous system with organic acoustics, calm tempos, and tranquil soundscapes.',
    targetMood: 'Calm',
    focusTypes: ['De-stress & Unwind', 'Mindful Meditation', 'Deep Breathing', 'Evening Wind-down'],
    musicStyles: ['Ambient', 'Acoustic', 'Soft Piano', 'Lo-fi', 'Nature Sounds'],
    vocals: ['Instrumental Only', 'Soft Vocals', 'Vocals Allowed'],
    durations: [
      { label: '15 min', value: 15 },
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Gentle & Peaceful', 'Ultra-Low Stillness']
  },
  Sleep: {
    title: 'Sleep Mode Configuration',
    description: 'Gentle, minimalist twilight melodies designed to assist your evening wind-down routine.',
    disclaimer: 'Audio soundscapes assist relaxation routines; Moodify AI does not guarantee medical sleep outcomes.',
    targetMood: 'Calm',
    focusTypes: ['Wind Down', 'Twilight Drift', 'Deep Sleep Soundscape', 'Lucid Rest'],
    musicStyles: ['Deep Ambient', 'Gentle Piano', 'Classical Lullaby', 'Nature Sounds'],
    vocals: ['Instrumental Only', 'No Vocals Preferred'],
    durations: [
      { label: '15 min', value: 15 },
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: '90 min', value: 90 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Whisper-Quiet', 'Low']
  },
  Workout: {
    title: 'Workout Mode Configuration',
    description: 'High-tempo rhythmic motivation engineered for physical drive and athletic endurance.',
    targetMood: 'Energetic',
    focusTypes: ['Cardio & Running', 'HIIT Intensity', 'Strength Training', 'Warm-up & Stretch'],
    musicStyles: ['Electronic & EDM', 'Dance & House', 'Rock & Alternative', 'Hip-Hop & Beats'],
    vocals: ['Vocals Allowed', 'High Energy Beats', 'Instrumental EDM'],
    durations: [
      { label: '15 min', value: 15 },
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Medium', 'High', 'Maximum Drive']
  },
  Travel: {
    title: 'Travel Mode Configuration',
    description: 'Dynamic journey soundtracks tailored for road trips, scenic exploration, and transit.',
    targetMood: 'Happy',
    focusTypes: ['Road Trip', 'Flight & Transit', 'City Walk', 'Scenic Cruise'],
    musicStyles: ['Indie & Folk', 'Pop & Feel-Good', 'Acoustic', 'World & Adventure'],
    vocals: ['Vocals Allowed', 'Any'],
    durations: [
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Medium', 'Dynamic Exploration']
  },
  Chill: {
    title: 'Chill Mode Configuration',
    description: 'Easygoing background grooves, soul, and mellow indie pop for relaxed hours.',
    targetMood: 'Calm',
    focusTypes: ['Sunday Lounge', 'Coffeehouse', 'Late Night Mellow', 'Easy Listening'],
    musicStyles: ['Lo-Fi', 'Soul & R&B', 'Indie Pop', 'Chillwave'],
    vocals: ['Soft Vocals', 'Instrumental Only', 'Vocals Allowed'],
    durations: [
      { label: '15 min', value: 15 },
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: 'Continuous', value: 0 }
    ],
    energies: ['Low', 'Medium Mellow']
  }
};

const SmartModeModal = ({
  mode,
  onClose,
  setCurrentSong,
  setQueue,
  favorites = new Set(),
  listeningHistory = [],
  onSessionStart,
  currentSong,
  activeSession
}) => {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS.Study;

  // Configuration options state
  const [selectedFocus, setSelectedFocus] = useState(config.focusTypes[0]);
  const [selectedStyle, setSelectedStyle] = useState(config.musicStyles[0]);
  const [selectedVocal, setSelectedVocal] = useState(config.vocals ? config.vocals[0] : 'Instrumental Only');
  const [selectedDuration, setSelectedDuration] = useState(config.durations[1] || config.durations[0]);
  const [selectedEnergy, setSelectedEnergy] = useState(config.energies[0]);
  const [pauseAtEnd, setPauseAtEnd] = useState(true);

  // Workflow steps: 'config' | 'results'
  const [step, setStep] = useState('config');
  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);
  const [whySongModalTrack, setWhySongModalTrack] = useState(null);

  // Active session timer state
  const [sessionActive, setSessionActive] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer countdown tick
  useEffect(() => {
    if (sessionActive && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setSessionActive(false);
            if (pauseAtEnd) {
              const audioEls = document.querySelectorAll('audio');
              audioEls.forEach(a => a.pause());
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (remainingSeconds <= 0 && sessionActive) {
      setSessionActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionActive, remainingSeconds, pauseAtEnd]);

  // Handle Find Tracks / Generate Playlist
  const handleFindTracks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Map music styles to genres
      const genreQuery = [selectedStyle];
      if (selectedVocal === 'Instrumental Only') {
        genreQuery.push('Instrumental');
      }

      const favIds = favorites ? [...favorites] : [];
      const recent = (listeningHistory || []).slice(0, 15).map(h => ({
        id: h.songId || h.id,
        title: h.title,
        artist: h.artist,
        genre: h.genre,
        skipped: Boolean(h.skipped),
        completed: Boolean(h.completed),
        listenedDuration: h.listenedDuration || 0
      }));

      const res = await getAiRecommendations(
        config.targetMood,
        genreQuery,
        favIds,
        recent,
        '', // language
        [], // favArtists
        mode // listeningMode
      );

      const recs = res.recommendations || [];
      setTracks(recs);
      setStep('results');
    } catch (err) {
      console.warn('Smart mode recommendation error:', err);
      setError(err.message || 'Failed to curate tracks for this mode. Please adjust preferences and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Start Listening / Start Track
  const handleStartSession = () => {
    if (!tracks || tracks.length === 0) return;

    // Filter playable tracks
    const playable = tracks.filter(t => t.audioUrl || t.isPlayable);
    const queueToSet = playable.length > 0 ? playable : tracks;

    if (setQueue) {
      setQueue(queueToSet);
    }

    // Play first playable track
    const firstToPlay = playable.length > 0 ? playable[0] : tracks[0];
    if (setCurrentSong) {
      setCurrentSong(firstToPlay);
    }

    if (onSessionStart) {
      onSessionStart({
        mode,
        duration: selectedDuration.value,
        focus: selectedFocus,
        trackCount: queueToSet.length,
        pauseAtEnd,
        tracks: queueToSet
      });
    }

    // FIX 4: Handoff queue and close modal immediately to show bottom player
    if (onClose) {
      onClose();
    }
  };

  const handlePlayIndividualTrack = (trk) => {
    if (!trk) return;
    const playable = tracks.filter(t => t.audioUrl || t.isPlayable);
    const queueToSet = playable.length > 0 ? playable : tracks;

    if (setCurrentSong) {
      setCurrentSong(trk);
    }
    if (setQueue) {
      setQueue(queueToSet);
    }

    if (onSessionStart) {
      onSessionStart({
        mode,
        duration: selectedDuration.value,
        focus: selectedFocus,
        trackCount: queueToSet.length,
        pauseAtEnd,
        tracks: queueToSet
      });
    }

    // FIX 4: Close modal on individual track selection to reveal shared player
    if (onClose) {
      onClose();
    }
  };

  // Format mm:ss
  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-mood-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl border border-mood-black/10 flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-6 pb-4 border-b border-mood-black/10 flex items-start justify-between gap-4 shrink-0 bg-mood-black/[0.01]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-mood-cobalt/10 text-mood-cobalt border border-mood-cobalt/20">
                Smart Listening Mode
              </span>
              <span className="text-xs font-bold text-mood-forest">{mode}</span>
            </div>
            <h3 className="text-2xl font-black text-mood-forest tracking-tight mt-1">{config.title}</h3>
            <p className="text-xs text-mood-black/60 font-medium mt-0.5">{config.description}</p>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-xl text-mood-black/40 hover:text-mood-forest hover:bg-mood-black/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* STEP 1: CONFIGURATION */}
          {step === 'config' && (
            <div className="space-y-6">
              {config.disclaimer && (
                <div className="bg-purple-50 border border-purple-200/80 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-purple-900 font-medium">
                  <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <p>{config.disclaimer}</p>
                </div>
              )}

              {/* Focus Type / Activity */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider">
                  Select Focus Activity / Context
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.focusTypes.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelectedFocus(f)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        selectedFocus === f
                          ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs scale-102'
                          : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Music Style / Sound Palette */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider">
                  Music Style & Acoustics
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.musicStyles.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedStyle(s)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        selectedStyle === s
                          ? 'bg-mood-cobalt text-white border-mood-cobalt shadow-xs scale-102'
                          : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vocals Preference */}
              {config.vocals && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider">
                    Vocal Presence
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {config.vocals.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSelectedVocal(v)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          selectedVocal === v
                            ? 'bg-mood-forest text-mood-lime border-mood-forest shadow-xs'
                            : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Session Duration */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider">
                  Session Duration
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.durations.map(d => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setSelectedDuration(d)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                        selectedDuration.label === d.label
                          ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs'
                          : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 opacity-60" />
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy Level */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-mood-black/60 uppercase tracking-wider">
                  Energy & Intensity
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.energies.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setSelectedEnergy(e)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        selectedEnergy === e
                          ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs'
                          : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: RECOMMENDATIONS & START TRACK */}
          {step === 'results' && (
            <div className="space-y-5">
              
              {/* Active Timer Banner if Running */}
              {sessionActive && (
                <div className="bg-gradient-to-r from-mood-forest to-[#1c3a21] text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
                  <div className="flex items-center gap-3">
                    <Timer className="w-6 h-6 text-mood-lime animate-pulse" />
                    <div>
                      <p className="text-xs font-extrabold uppercase text-mood-lime">Active {mode} Session</p>
                      <p className="text-lg font-black">{formatTimer(remainingSeconds)} remaining</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSessionActive(false)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                  >
                    Pause Timer
                  </button>
                </div>
              )}

              {/* Curated Track List */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-mood-forest">Curated Tracks for {selectedFocus}</h4>
                  <p className="text-xs text-mood-black/50">
                    {tracks.length} tracks selected matching {selectedStyle} ({selectedDuration.label})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('config')}
                  className="flex items-center gap-1 text-xs font-bold text-mood-cobalt hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Edit Preferences
                </button>
              </div>

              {tracks.length > 0 ? (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {tracks.map((trk, i) => {
                    const isPlayable = Boolean(trk.audioUrl || trk.isPlayable);
                    const isPlaying = currentSong && (currentSong.id === trk.id || currentSong._id === trk.id);

                    return (
                      <div
                        key={trk.id || trk._id || i}
                        onClick={() => handlePlayIndividualTrack(trk)}
                        className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer group ${
                          isPlaying
                            ? 'bg-mood-cobalt/5 border-mood-cobalt shadow-xs'
                            : 'bg-white hover:bg-mood-black/[0.02] border-mood-black/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 shadow-xs">
                            <SongCover
                              src={trk.cover || trk.albumArt}
                              title={trk.title}
                              artist={trk.artist}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-mood-forest/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-mood-forest truncate group-hover:text-mood-cobalt">{trk.title}</p>
                            <p className="text-[11px] text-mood-black/60 truncate">{trk.artist}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isPlayable ? (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Preview Available
                                </span>
                              ) : (
                                <span className="text-[9px] font-medium text-mood-black/50 bg-mood-black/5 px-1.5 py-0.2 rounded">
                                  Catalog Only
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setWhySongModalTrack(trk)}
                            title="Why this song was recommended"
                            className="p-1.5 rounded-xl bg-mood-black/5 text-mood-black/60 hover:text-mood-cobalt hover:bg-mood-cobalt/10 transition-colors"
                          >
                            <HelpCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-mood-black/50 space-y-2">
                  <p>No exact tracks matched your precise genre and mode criteria.</p>
                  <button
                    type="button"
                    onClick={() => setStep('config')}
                    className="text-mood-cobalt font-bold underline"
                  >
                    Adjust preferences and try again
                  </button>
                </div>
              )}

              {/* End of session behavior */}
              {selectedDuration.value > 0 && (
                <div className="flex items-center justify-between p-3.5 bg-mood-black/[0.02] border border-mood-black/5 rounded-2xl text-xs font-semibold text-mood-forest">
                  <span>At session end ({selectedDuration.label}):</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pauseAtEnd}
                      onChange={e => setPauseAtEnd(e.target.checked)}
                      className="rounded accent-mood-cobalt"
                    />
                    <span>Pause playback automatically</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-mood-black/10 flex items-center justify-between gap-4 shrink-0 bg-mood-black/[0.01]">
          {step === 'config' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-mood-black/60 hover:text-mood-forest transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFindTracks}
                disabled={isLoading}
                className="px-6 py-2.5 bg-mood-forest text-mood-offwhite text-xs font-bold rounded-2xl hover:bg-mood-forest/90 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <Loader className="w-4 h-4 animate-spin text-mood-lime" /> : <Sparkles className="w-4 h-4 text-mood-lime" />}
                {isLoading ? 'Curating Tracks...' : 'Find Tracks & Generate Session'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('config')}
                className="px-4 py-2 text-xs font-bold text-mood-black/60 hover:text-mood-forest transition-colors cursor-pointer"
              >
                Back to Options
              </button>
              <button
                type="button"
                onClick={handleStartSession}
                className="px-6 py-2.5 bg-mood-cobalt text-white text-xs font-bold rounded-2xl hover:bg-mood-cobalt/90 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                {sessionActive ? 'Restart Session' : 'Start Listening Session'}
              </button>
            </>
          )}
        </div>

        {/* Why this song modal */}
        {whySongModalTrack && (
          <WhyThisSongModal
            song={whySongModalTrack}
            onClose={() => setWhySongModalTrack(null)}
          />
        )}
      </div>
    </div>
  );
};

export default SmartModeModal;
