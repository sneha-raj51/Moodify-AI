import React, { useState, useEffect, useMemo } from 'react';
import { 
  Repeat, Play, Pause, ChevronRight, AlertCircle, Sparkles, Loader, 
  HelpCircle, CheckCircle2, ThumbsUp, ThumbsDown, ArrowRight, 
  Moon, Sun, Brain, HeartPulse, Sliders, Volume2, Music, RotateCcw,
  ListMusic
} from 'lucide-react';
import { getMoodTransitionRecommendations, recordFeedback } from '../services/api';
import SongCover from '../components/SongCover';
import WhyThisSongModal from '../components/WhyThisSongModal';
import ListeningModeSelector from '../components/ListeningModeSelector';

const PREDEFINED_GOALS = [
  {
    id: 'lift-mood',
    title: 'Lift My Mood',
    tagline: 'Sad / Low Spirits → Joyful & Uplifted',
    icon: Sun,
    color: 'from-amber-500/20 to-orange-500/20 text-amber-700 border-amber-300/40',
    defaultStart: 'Sad',
    defaultTarget: 'Happy',
    suggestedMode: 'chill'
  },
  {
    id: 'relax',
    title: 'Deep Relaxation & Stress Relief',
    tagline: 'Stressed / Frantic → Peaceful Stillness',
    icon: HeartPulse,
    color: 'from-teal-500/20 to-cyan-500/20 text-teal-800 border-teal-300/40',
    defaultStart: 'Angry',
    defaultTarget: 'Calm',
    suggestedMode: 'relax'
  },
  {
    id: 'focus',
    title: 'Focus & Productivity Flow',
    tagline: 'Distracted / Restless → Deep Study Cadence',
    icon: Brain,
    color: 'from-indigo-500/20 to-blue-500/20 text-indigo-800 border-indigo-300/40',
    defaultStart: 'Neutral',
    defaultTarget: 'Calm',
    suggestedMode: 'study'
  },
  {
    id: 'sleep',
    title: 'Wind Down for Sleep',
    tagline: 'Evening Alertness → Deep Restorative Sleep',
    icon: Moon,
    color: 'from-purple-500/20 to-indigo-500/20 text-purple-800 border-purple-300/40',
    defaultStart: 'Calm',
    defaultTarget: 'Calm',
    suggestedMode: 'sleep'
  },
  {
    id: 'custom',
    title: 'Custom Journey',
    tagline: 'Choose your own emotional start & finish',
    icon: Sliders,
    color: 'from-gray-500/20 to-slate-500/20 text-gray-800 border-gray-300/40',
    defaultStart: 'Neutral',
    defaultTarget: 'Happy',
    suggestedMode: null
  }
];

const MOODS = ['Happy', 'Sad', 'Calm', 'Energetic', 'Neutral', 'Angry', 'Romantic'];
const GENRES = ['Any', 'Pop', 'Acoustic', 'Ambient', 'Classical', 'Rock', 'Electronic', 'Lo-Fi', 'Bollywood'];

const MoodTransition = ({ songs = [], globalMood, setCurrentSong, setQueue, favorites = new Set(), currentSong }) => {
  const [selectedGoal, setSelectedGoal] = useState('lift-mood');
  const [startMood, setStartMood] = useState(globalMood && globalMood !== 'All' ? globalMood : 'Sad');
  const [targetMood, setTargetMood] = useState('Happy');
  const [stepsCount, setStepsCount] = useState(3);
  const [preferredGenre, setPreferredGenre] = useState('Any');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [selectedListeningMode, setSelectedListeningMode] = useState('chill');
  
  // Journey response & active stage
  const [journeyData, setJourneyData] = useState(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0); // 0-indexed
  const [isLoading, setIsLoading] = useState(false);
  const [whySongModalTrack, setWhySongModalTrack] = useState(null);
  const [feedbackState, setFeedbackState] = useState({});
  const [actionNotice, setActionNotice] = useState('');
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => {
    return localStorage.getItem('moodify_crossfade_enabled') === 'true';
  });
  const [crossfadeDuration, setCrossfadeDuration] = useState(() => {
    return Number(localStorage.getItem('moodify_crossfade_seconds')) || 2;
  });

  const toggleCrossfade = (enabled) => {
    setCrossfadeEnabled(enabled);
    localStorage.setItem('moodify_crossfade_enabled', String(enabled));
  };

  const changeCrossfadeDuration = (secs) => {
    setCrossfadeDuration(secs);
    localStorage.setItem('moodify_crossfade_seconds', String(secs));
  };

  // Fetch or regenerate the adaptive journey
  const generateJourney = async () => {
    setIsLoading(true);
    try {
      const favIds = favorites ? [...favorites] : [];
      const favGenres = preferredGenre !== 'Any' ? [preferredGenre] : [];
      
      const payload = {
        goal: selectedGoal !== 'custom' ? selectedGoal : null,
        startMood,
        desiredMood: targetMood,
        stepsCount: Number(stepsCount) || 3,
        favoriteGenres: favGenres,
        language: preferredLanguage,
        favoriteSongIds: favIds,
        listeningMode: selectedListeningMode
      };

      const res = await getMoodTransitionRecommendations(payload);
      if (res && (res.stages || res.steps)) {
        setJourneyData(res);
        setActiveStageIndex(0);
      }
    } catch (err) {
      console.warn('Adaptive Journey generation error, using fallback:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync goal selection with defaults
  const handleSelectGoal = (goalId) => {
    setSelectedGoal(goalId);
    const goal = PREDEFINED_GOALS.find(g => g.id === goalId);
    if (goal && goal.id !== 'custom') {
      setStartMood(goal.defaultStart);
      setTargetMood(goal.defaultTarget);
      if (goal.suggestedMode) setSelectedListeningMode(goal.suggestedMode);
    }
  };

  useEffect(() => {
    generateJourney();
  }, [selectedGoal, preferredGenre, preferredLanguage, selectedListeningMode]);

  // Active stages from journey response
  const stages = useMemo(() => {
    if (journeyData?.stages && journeyData.stages.length > 0) {
      return journeyData.stages;
    }
    if (journeyData?.steps && journeyData.steps.length > 0) {
      return journeyData.steps.map((st, i) => ({
        stageIndex: st.stepIndex,
        stageName: i === 0 ? 'Grounding' : i === journeyData.steps.length - 1 ? 'Target Arrival' : `Step ${i + 1}`,
        targetMood: st.targetMood,
        whyThisStage: `Stage ${i + 1} gently guides you toward ${st.targetMood} mood.`,
        recommendedSongs: st.recommendedSongs || []
      }));
    }
    return [];
  }, [journeyData]);

  // Flattened tracks across all stages in chronological sequence
  const allJourneyTracks = useMemo(() => {
    const list = [];
    stages.forEach(st => {
      (st.recommendedSongs || []).forEach(trk => {
        list.push({ 
          ...trk, 
          stageName: st.stageName, 
          stageMood: st.targetMood,
          stageEnergy: st.energyLevel || 'Balanced',
          stageTempo: st.tempoBpm || 'Moderate tempo'
        });
      });
    });
    return list;
  }, [stages]);

  const currentStage = stages[activeStageIndex] || stages[0];

  // Play a song from a stage
  const handlePlayTrack = (song, stageTracks = []) => {
    if (!setCurrentSong) return;
    const songObj = {
      id: song.songId || song.id || song._id,
      _id: song.songId || song.id || song._id,
      title: song.title,
      artist: song.artist,
      cover: song.cover || song.albumArt,
      genre: song.genre,
      mood: song.mood,
      audioUrl: song.audioUrl,
      isPlayable: Boolean(song.audioUrl || song.isPlayable),
      reasons: song.reasons || [],
      scoringFactors: song.scoringFactors || {},
      explanation: song.explanation || ''
    };
    setCurrentSong(songObj);

    if (setQueue && stageTracks.length > 0) {
      const q = stageTracks.map(t => ({
        id: t.songId || t.id || t._id,
        _id: t.songId || t.id || t._id,
        title: t.title,
        artist: t.artist,
        cover: t.cover || t.albumArt,
        genre: t.genre,
        mood: t.mood,
        audioUrl: t.audioUrl,
        isPlayable: Boolean(t.audioUrl || t.isPlayable),
        reasons: t.reasons || [],
        scoringFactors: t.scoringFactors || {},
        explanation: t.explanation || ''
      }));
      setQueue(q);
    }
  };

  // Play entire stage
  const handlePlayEntireStage = (stage) => {
    if (!stage || !stage.recommendedSongs || stage.recommendedSongs.length === 0) return;
    handlePlayTrack(stage.recommendedSongs[0], stage.recommendedSongs);
  };

  // Feature 6: Explicit Start Full Journey across all stages in sequence
  const handleStartFullJourney = () => {
    if (allJourneyTracks.length === 0) return;
    handlePlayTrack(allJourneyTracks[0], allJourneyTracks);
    setActionNotice('Started Adaptive Journey: Playing Stage 1 with sequential stage queueing.');
    setTimeout(() => setActionNotice(''), 4000);
  };

  // Feature 6: Non-disruptive append of journey tracks to player queue
  const handleAppendJourneyToQueue = () => {
    if (!setQueue || allJourneyTracks.length === 0) return;
    const formatted = allJourneyTracks.map(t => ({
      id: t.songId || t.id || t._id,
      _id: t.songId || t.id || t._id,
      title: t.title,
      artist: t.artist,
      cover: t.cover || t.albumArt,
      genre: t.genre,
      mood: t.mood,
      audioUrl: t.audioUrl,
      isPlayable: Boolean(t.audioUrl || t.isPlayable),
      reasons: t.reasons || [],
      scoringFactors: t.scoringFactors || {},
      explanation: t.explanation || ''
    }));
    setQueue(prev => [...(prev || []), ...formatted]);
    setActionNotice(`Added ${formatted.length} journey tracks across all stages to your queue.`);
    setTimeout(() => setActionNotice(''), 4000);
  };

  // Record feedback directly on a journey track
  const handleFeedback = async (song, action, e) => {
    e.stopPropagation();
    const songId = song.songId || song.id || song._id;
    const isCurrentAction = feedbackState[songId] === action;
    const nextAction = isCurrentAction ? null : action;

    setFeedbackState(prev => ({ ...prev, [songId]: nextAction }));

    try {
      if (nextAction) {
        await recordFeedback({
          songId: String(songId),
          action: nextAction,
          title: song.title,
          artist: song.artist,
          genre: song.genre,
          mood: song.mood
        });
      }
    } catch (err) {
      console.warn('Feedback recording failed:', err);
    }
  };

  return (
    <div className="pb-36">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-10">

        {/* Header */}
        <header className="space-y-3 pb-6 border-b border-mood-black/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-mood-forest text-mood-lime flex items-center justify-center shadow-xs">
                <Repeat className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight text-mood-forest">Emotion-Aware Adaptive Journey</h2>
                <p className="text-sm text-mood-black/60 font-medium">
                  Multi-stage music pathways scientifically structured to guide you from where you are to how you want to feel
                </p>
              </div>
            </div>

            <button
              onClick={generateJourney}
              disabled={isLoading}
              className="flex items-center gap-2 bg-mood-forest text-mood-offwhite px-4 py-2.5 rounded-2xl text-xs font-bold hover:bg-mood-forest/90 transition-all shadow-xs disabled:opacity-50"
            >
              {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4 text-mood-lime" />}
              Regenerate Journey
            </button>
          </div>
        </header>

        {/* Goal Selector Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-mood-black/50">
              Select Your Emotional Destination Goal
            </span>
            <span className="text-xs font-semibold text-mood-cobalt flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Multi-Stage Audio Psychology
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {PREDEFINED_GOALS.map((g) => {
              const isSelected = selectedGoal === g.id;
              const Icon = g.icon;
              return (
                <button
                  key={g.id}
                  onClick={() => handleSelectGoal(g.id)}
                  className={`text-left p-4 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-md scale-[1.02]'
                      : 'bg-white hover:bg-mood-black/[0.02] border-mood-black/10 text-mood-forest'
                  }`}
                >
                  <div className="space-y-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-mood-lime text-mood-forest' : 'bg-mood-black/5 text-mood-black/70'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-sm tracking-tight leading-tight">{g.title}</p>
                      <p className={`text-[11px] mt-1 line-clamp-2 ${isSelected ? 'text-mood-offwhite/80' : 'text-mood-black/60'}`}>
                        {g.tagline}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-mood-lime">
                      <CheckCircle2 className="w-3 h-3" /> Selected Goal
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Customization Options Bar */}
        <section className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-mood-black/5 pb-3">
            <span className="text-xs font-bold text-mood-forest uppercase tracking-wider">
              Journey Fine-Tuning & Preferences
            </span>
            <span className="text-xs text-mood-black/40">Customizes tempo & acoustics</span>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-mood-black/60 uppercase mb-1.5">Starting State</label>
              <select
                value={startMood}
                onChange={(e) => setStartMood(e.target.value)}
                className="w-full bg-mood-black/5 rounded-xl px-3 py-2 text-xs font-bold text-mood-forest focus:outline-hidden"
              >
                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-mood-black/60 uppercase mb-1.5">Target State</label>
              <select
                value={targetMood}
                onChange={(e) => setTargetMood(e.target.value)}
                className="w-full bg-mood-black/5 rounded-xl px-3 py-2 text-xs font-bold text-mood-forest focus:outline-hidden"
              >
                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-mood-black/60 uppercase mb-1.5">Preferred Genre</label>
              <select
                value={preferredGenre}
                onChange={(e) => setPreferredGenre(e.target.value)}
                className="w-full bg-mood-black/5 rounded-xl px-3 py-2 text-xs font-bold text-mood-forest focus:outline-hidden"
              >
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-mood-black/60 uppercase mb-1.5">Language</label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full bg-mood-black/5 rounded-xl px-3 py-2 text-xs font-bold text-mood-forest focus:outline-hidden"
              >
                <option value="">Any Language</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Punjabi">Punjabi</option>
              </select>
            </div>
          </div>

          {/* Smart Listening Mode Selector Integration (Feature 3) */}
          <div className="pt-2">
            <ListeningModeSelector
              selectedMode={selectedListeningMode}
              onSelectMode={setSelectedListeningMode}
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
              currentSong={currentSong}
            />
          </div>
        </section>

        {/* Multi-Stage Visual Roadmap */}
        {stages.length > 0 && (
          <section className="space-y-6">
            
            {/* Master Journey Audio Control Bar (Feature 6: Explicit Non-Auto-Playing Start / Queue Integration) */}
            <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-mood-cobalt/10 text-mood-cobalt">
                      Adaptive Journey
                    </span>
                    <span className="text-xs font-bold text-mood-forest">
                      {allJourneyTracks.length} Curated Tracks Across {stages.length} Stages
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-mood-forest mt-1">Journey Sequencing</h3>
                  <p className="text-xs text-mood-black/60 font-medium">
                    Start playback when you are ready, or append the multi-stage progression to your current queue.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleStartFullJourney}
                    className="flex items-center gap-2 bg-mood-forest text-mood-lime px-5 py-2.5 rounded-2xl text-xs font-black hover:bg-mood-forest/90 transition-all shadow-xs"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    Start Full Journey
                  </button>

                  <button
                    onClick={handleAppendJourneyToQueue}
                    className="flex items-center gap-2 bg-mood-black/5 hover:bg-mood-cobalt/10 text-mood-forest hover:text-mood-cobalt px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border border-mood-black/5"
                  >
                    <ListMusic className="w-4 h-4" />
                    Add Journey to Queue
                  </button>
                </div>
              </div>

              {/* Crossfade Audio Transition Settings */}
              <div className="pt-3 border-t border-mood-black/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-mood-forest flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-mood-cobalt" />
                    Smooth Transition Crossfade:
                  </span>
                  <button
                    onClick={() => toggleCrossfade(!crossfadeEnabled)}
                    className={`px-3 py-1 rounded-xl font-bold transition-all ${
                      crossfadeEnabled
                        ? 'bg-mood-cobalt text-white shadow-xs'
                        : 'bg-mood-black/5 text-mood-black/60 hover:bg-mood-black/10'
                    }`}
                  >
                    {crossfadeEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                  {crossfadeEnabled && (
                    <div className="flex items-center gap-1 bg-mood-black/5 p-0.5 rounded-xl">
                      {[1, 2, 3].map(secs => (
                        <button
                          key={secs}
                          onClick={() => changeCrossfadeDuration(secs)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            crossfadeDuration === secs
                              ? 'bg-white text-mood-forest shadow-xs'
                              : 'text-mood-black/60'
                          }`}
                        >
                          {secs}s
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-mood-black/50 italic">
                  Softens volume shifts between bridging stages. Verified Apple Music previews respect preview duration boundaries.
                </p>
              </div>

              {actionNotice && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {actionNotice}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-mood-forest tracking-tight">Your Adaptive Journey Pathway</h3>
                <p className="text-xs text-mood-black/60">
                  Stage {activeStageIndex + 1} of {stages.length} • {currentStage?.stageName}
                </p>
              </div>

              {/* Stage Stepper Buttons */}
              <div className="flex items-center gap-2">
                <button
                  disabled={activeStageIndex === 0}
                  onClick={() => setActiveStageIndex(prev => Math.max(0, prev - 1))}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-mood-black/5 text-mood-black/70 hover:text-mood-forest disabled:opacity-30"
                >
                  Previous Stage
                </button>
                <button
                  disabled={activeStageIndex === stages.length - 1}
                  onClick={() => setActiveStageIndex(prev => Math.min(stages.length - 1, prev + 1))}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-mood-forest text-mood-offwhite hover:bg-mood-forest/90 disabled:opacity-30 flex items-center gap-1"
                >
                  Next Stage <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Stepper Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stages.map((st, idx) => {
                const isActive = activeStageIndex === idx;
                const isPassed = activeStageIndex > idx;
                const energy = st.energyLevel || (idx === 0 ? 'Gentle / Low (30%)' : idx === stages.length - 1 ? 'High / Vibrant (85%)' : 'Balanced (55%)');
                const tempo = st.tempoBpm || (idx === 0 ? '60–75 BPM' : idx === stages.length - 1 ? '115–130 BPM' : '85–105 BPM');
                return (
                  <div
                    key={idx}
                    onClick={() => setActiveStageIndex(idx)}
                    className={`cursor-pointer p-5 rounded-3xl border transition-all text-left space-y-2 relative ${
                      isActive 
                        ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-md ring-2 ring-mood-lime/50'
                        : isPassed 
                          ? 'bg-emerald-50/50 border-emerald-200/60 text-mood-forest'
                          : 'bg-white border-mood-black/10 text-mood-forest hover:border-mood-forest/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        isActive ? 'bg-mood-lime text-mood-forest' : isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-mood-black/5 text-mood-black/60'
                      }`}>
                        Stage {st.stageIndex || idx + 1}
                      </span>
                      <span className={`text-xs font-bold ${isActive ? 'text-mood-lime' : 'text-mood-cobalt'}`}>
                        Mood: {st.targetMood}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm tracking-tight">{st.stageName}</h4>
                      <p className={`text-xs mt-1 line-clamp-2 ${isActive ? 'text-mood-offwhite/80' : 'text-mood-black/60'}`}>
                        {st.whyThisStage}
                      </p>
                    </div>

                    {/* Energy & Tempo Progression Badges (Feature 6) */}
                    <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      <span className={`px-2 py-0.5 rounded-lg ${
                        isActive ? 'bg-white/10 text-mood-lime' : 'bg-mood-black/5 text-mood-black/60'
                      }`}>
                        Energy: {energy}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg ${
                        isActive ? 'bg-white/10 text-mood-offwhite' : 'bg-mood-black/5 text-mood-black/60'
                      }`}>
                        Tempo: {tempo}
                      </span>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[11px] font-semibold">
                      <span>{st.recommendedSongs?.length || 0} tracks curated</span>
                      {isActive && <span className="text-mood-lime font-bold">Currently Active</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Stage Detailed Breakdown & Tracks */}
            {currentStage && (
              <div className="bg-white rounded-3xl p-6 md:p-8 border border-mood-black/5 shadow-sm space-y-6">
                
                {/* Active Stage Header & "Why this stage?" Banner */}
                <div className="space-y-4 pb-6 border-b border-mood-black/5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black uppercase px-2.5 py-1 bg-mood-cobalt/10 text-mood-cobalt rounded-xl">
                          Active Stage {activeStageIndex + 1}
                        </span>
                        <span className="text-xs font-bold text-mood-forest">Target Mood: {currentStage.targetMood}</span>
                        <span className="text-[11px] font-semibold text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded-lg">
                          Tempo: {currentStage.tempoBpm || '85–100 BPM'}
                        </span>
                        <span className="text-[11px] font-semibold text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded-lg">
                          Energy: {currentStage.energyLevel || 'Balanced (55%)'}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black text-mood-forest mt-1">{currentStage.stageName}</h3>
                    </div>

                    <button
                      onClick={() => handlePlayEntireStage(currentStage)}
                      className="flex items-center gap-2 bg-mood-forest text-mood-offwhite px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-mood-forest/90 transition-all shadow-xs"
                    >
                      <Play className="w-4 h-4 text-mood-lime fill-current" />
                      Play Stage Tracks
                    </button>
                  </div>

                  {/* Why this stage psychological rationale */}
                  <div className="bg-mood-black/[0.02] border border-mood-black/5 rounded-2xl p-4 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-mood-cobalt shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-bold text-mood-forest uppercase tracking-wider">
                        Why this stage in your journey?
                      </h5>
                      <p className="text-xs text-mood-black/70 mt-1 leading-relaxed font-medium">
                        {currentStage.whyThisStage}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Track List for Current Stage */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-mood-black/50 uppercase tracking-wider">
                    <span>Curated Soundscape Tracks</span>
                    <span>Explainability & Feedback</span>
                  </div>

                  <div className="space-y-2.5">
                    {currentStage.recommendedSongs && currentStage.recommendedSongs.length > 0 ? (
                      currentStage.recommendedSongs.map((track) => {
                        const trackId = track.songId || track.id || track._id;
                        const isCurrentPlaying = currentSong && (currentSong.id === trackId || currentSong._id === trackId);
                        const userFb = feedbackState[trackId];

                        return (
                          <div
                            key={trackId}
                            onClick={() => handlePlayTrack(track, currentStage.recommendedSongs)}
                            className={`flex items-center justify-between gap-4 p-3.5 rounded-2xl border transition-all cursor-pointer group ${
                              isCurrentPlaying
                                ? 'bg-mood-cobalt/5 border-mood-cobalt shadow-xs'
                                : 'bg-white hover:bg-mood-black/[0.02] border-mood-black/5 hover:border-mood-black/15'
                            }`}
                          >
                            {/* Track Info */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-xs">
                                <SongCover
                                  src={track.cover || track.albumArt}
                                  title={track.title}
                                  artist={track.artist}
                                  className="w-full h-full object-cover"
                                />
                                <div className={`absolute inset-0 bg-mood-forest/40 flex items-center justify-center transition-opacity ${
                                  isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}>
                                  <Play className="w-4 h-4 text-mood-lime fill-current ml-0.5" />
                                </div>
                              </div>

                              <div className="min-w-0">
                                <p className="font-bold text-sm text-mood-forest truncate group-hover:text-mood-cobalt transition-colors">
                                  {track.title}
                                </p>
                                <p className="text-xs text-mood-black/60 truncate">
                                  {track.artist} {track.genre ? `• ${track.genre}` : ''}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {track.language && (
                                    <span className="text-[10px] font-semibold text-mood-cobalt bg-mood-cobalt/10 px-2 py-0.5 rounded">
                                      {track.language}
                                    </span>
                                  )}
                                  {track.audioUrl || track.isPlayable ? (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                                      Playable Preview
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded">
                                      Catalog
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions: Why This Song (Feature 1) + Thumbs Up/Down (Feature 2) */}
                            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Why this song button */}
                              <button
                                onClick={() => setWhySongModalTrack(track)}
                                title="Why was this song selected for this journey stage?"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-mood-black/5 hover:bg-mood-cobalt/10 text-mood-black/70 hover:text-mood-cobalt text-[11px] font-bold transition-all"
                              >
                                <HelpCircle className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Why this track?</span>
                              </button>

                              {/* Thumbs up */}
                              <button
                                onClick={(e) => handleFeedback(track, 'like', e)}
                                title="Like track"
                                className={`p-2 rounded-xl transition-all ${
                                  userFb === 'like'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'hover:bg-mood-black/5 text-mood-black/40 hover:text-emerald-600'
                                }`}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>

                              {/* Thumbs down */}
                              <button
                                onClick={(e) => handleFeedback(track, 'dislike', e)}
                                title="Dislike track"
                                className={`p-2 rounded-xl transition-all ${
                                  userFb === 'dislike'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'hover:bg-mood-black/5 text-mood-black/40 hover:text-rose-600'
                                }`}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-xs text-mood-black/40">
                        No songs matched this stage's filter. Try regenerating or choosing a different genre.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </section>
        )}

        {/* Feature 1: Why This Song Modal Integration */}
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

export default MoodTransition;
