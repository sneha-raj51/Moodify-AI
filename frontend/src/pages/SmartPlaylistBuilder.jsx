import React, { useState } from 'react';
import { 
  Sparkles, Play, Shuffle, Plus, Clock, 
  Heart, Trash2, RefreshCw, 
  AlertCircle, CheckCircle2, Music, ListPlus, Sliders, ChevronDown, ChevronUp, Info, Loader, ArrowLeft, RotateCcw
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const MOODS = [
  { label: 'Any Mood', value: 'Any', emoji: '✨' },
  { label: 'Happy', value: 'Happy', emoji: '😊' },
  { label: 'Calm', value: 'Calm', emoji: '🌿' },
  { label: 'Energetic', value: 'Energetic', emoji: '⚡' },
  { label: 'Sad', value: 'Sad', emoji: '🌧️' },
  { label: 'Neutral', value: 'Neutral', emoji: '☕' },
  { label: 'Surprise', value: 'Surprise', emoji: '🎉' },
  { label: 'Angry', value: 'Angry', emoji: '🔥' },
  { label: 'Fear', value: 'Fear', emoji: '🌑' },
  { label: 'Disgust', value: 'Disgust', emoji: '🌪️' }
];

const GENRES = [
  'Any', 'Pop', 'Rock', 'Bollywood', 'Lo-fi', 'Classical', 
  'Hip-hop', 'Jazz', 'Electronic', 'Indie', 'Acoustic'
];

const ENERGIES = [
  { label: 'Any Energy', value: 'Any' },
  { label: 'Low', value: 'Low', desc: 'Acoustic, ambient, calm' },
  { label: 'Medium', value: 'Medium', desc: 'Melodic, balanced tempo' },
  { label: 'High', value: 'High', desc: 'Upbeat, dance, energetic' }
];

const VOCAL_OPTIONS = [
  { label: 'Any Vocals', value: 'Any' },
  { label: 'Vocals', value: 'Vocals' },
  { label: 'Instrumental', value: 'Instrumental' }
];

const LANGUAGES = ['Any', 'English', 'Hindi', 'Punjabi', 'Spanish'];

const DURATION_PRESETS = [15, 30, 45, 60];

const SmartPlaylistBuilder = ({
  setCurrentSong,
  setQueue,
  currentSong,
  favorites = new Set(),
  toggleFavorite,
  onOpenAddToPlaylist,
  setCurrentView,
  user
}) => {
  // Screen View State: 'builder' | 'results'
  const [viewState, setViewState] = useState('builder');

  // Filter States (preserved across view switches)
  const [mood, setMood] = useState('Any');
  const [genre, setGenre] = useState('Any');
  const [energy, setEnergy] = useState('Any');
  const [vocalPreference, setVocalPreference] = useState('Any');
  const [language, setLanguage] = useState('Any');
  const [durationPreset, setDurationPreset] = useState(30);
  const [customDuration, setCustomDuration] = useState('');
  const [isCustomDuration, setIsCustomDuration] = useState(false);

  // Preference Toggles
  const [preferFavoriteGenres, setPreferFavoriteGenres] = useState(true);
  const [preferFavoriteArtists, setPreferFavoriteArtists] = useState(true);
  const [excludeDisliked, setExcludeDisliked] = useState(true);
  const [excludeRecentlyRecommended, setExcludeRecentlyRecommended] = useState(false);
  const [artistDiversity, setArtistDiversity] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Generation & Result State
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [editableTracks, setEditableTracks] = useState([]);

  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savePlaylistName, setSavePlaylistName] = useState('');
  const [savePlaylistDesc, setSavePlaylistDesc] = useState('');
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  const effectiveDurationMinutes = isCustomDuration 
    ? Math.min(180, Math.max(5, parseInt(customDuration, 10) || 30))
    : durationPreset;

  const handleGenerate = async (isRegen = false) => {
    if (generating) return; // Prevent duplicate concurrent submissions
    setGenerating(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const excludedIds = isRegen && editableTracks.length > 0 
        ? editableTracks.map(t => String(t.id || t._id))
        : [];

      const payload = {
        mood,
        genre,
        energy,
        vocalPreference,
        language,
        targetDurationMinutes: effectiveDurationMinutes,
        preferences: {
          preferFavoriteGenres,
          preferFavoriteArtists,
          excludeDisliked,
          excludeRecentlyRecommended,
          artistDiversity
        },
        excludedTrackIds: excludedIds
      };

      const result = await api.generateSmartPlaylist(payload);
      setGeneratedResult(result);
      setEditableTracks(result.tracks || []);
      setSavePlaylistName(result.title || 'Smart Playlist');
      const moodText = mood !== 'Any' ? mood : 'Eclectic';
      const genreText = genre !== 'Any' ? genre : 'All Genres';
      setSavePlaylistDesc(`Mix tailored by mood (${moodText}), genre (${genreText}), and energy (${energy}).`);
      
      // Successfully generated: switch to results view as the primary content
      setViewState('results');
    } catch (err) {
      console.warn('Smart playlist generation failed:', err.message);
      setError(err.message || 'Unable to generate playlist. Please check your filter criteria and try again.');
      // Keep existing viewState so filters or prior results are never destroyed on error
    } finally {
      setGenerating(false);
    }
  };

  const handleEditFilters = () => {
    setError(null);
    setViewState('builder');
  };

  const handleStartFresh = () => {
    if (editableTracks.length > 0 && !saveSuccessMessage) {
      if (!window.confirm('Reset all filters and start a new playlist? Any unsaved results will be cleared.')) {
        return;
      }
    }
    setMood('Any');
    setGenre('Any');
    setEnergy('Any');
    setVocalPreference('Any');
    setLanguage('Any');
    setDurationPreset(30);
    setCustomDuration('');
    setIsCustomDuration(false);
    setGeneratedResult(null);
    setEditableTracks([]);
    setSaveSuccessMessage(null);
    setError(null);
    setViewState('builder');
  };

  const handleRemoveTrack = (trackId) => {
    setEditableTracks(prev => {
      const updated = prev.filter(t => String(t.id || t._id) !== String(trackId));
      return updated;
    });
  };

  // Dynamic calculations when tracks are modified or removed
  const totalSeconds = editableTracks.reduce((sum, t) => sum + (t.duration || 30), 0);
  const fullTracks = editableTracks.filter(t => t.playbackType === 'full');
  const previewTracks = editableTracks.filter(t => t.playbackType === 'preview');
  const totalMin = Math.floor(totalSeconds / 60);
  const totalSec = totalSeconds % 60;
  const dynamicDurationFormatted = `${totalMin}m ${totalSec}s`;

  const handlePlaySong = (song) => {
    if (!song) return;
    if (setQueue && editableTracks.length > 0) {
      setQueue(editableTracks);
    }
    setCurrentSong(song);
  };

  const handlePlayAll = (shuffle = false) => {
    if (!editableTracks || editableTracks.length === 0) return;
    let list = [...editableTracks];
    if (shuffle) {
      list.sort(() => Math.random() - 0.5);
    }
    if (setQueue) {
      setQueue(list);
    }
    setCurrentSong(list[0]);
  };

  const handleSavePlaylist = async (e) => {
    e.preventDefault();
    if (!savePlaylistName.trim() || editableTracks.length === 0) return;

    setSavingPlaylist(true);
    try {
      await api.createPlaylist({
        name: savePlaylistName.trim(),
        description: savePlaylistDesc.trim(),
        songs: editableTracks
      });
      setIsSaveModalOpen(false);
      setSaveSuccessMessage(`"${savePlaylistName.trim()}" has been saved to your playlists!`);
      window.dispatchEvent(new CustomEvent('moodify:playlists-changed'));
    } catch (err) {
      alert(err.message || 'Failed to save playlist');
    } finally {
      setSavingPlaylist(false);
    }
  };

  return (
    <div className="pb-36 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 space-y-6">
        
        {/* PAGE HEADER & TOP NAVIGATION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mood-forest/10 text-mood-forest text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-mood-lime" /> Smart Playlist Builder
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-mood-forest tracking-tight">
              {viewState === 'results' ? 'Your Generated Playlist' : 'Smart Playlist Builder'}
            </h1>
            <p className="text-sm text-mood-black/70 mt-1 max-w-2xl">
              {viewState === 'results' 
                ? 'Review your mix below. You can play, shuffle, remove songs, or save this playlist to your library.' 
                : 'Build a playlist tailored to your mood, genre, energy, and listening time.'}
            </p>
          </div>

          {/* VIEW-SPECIFIC NAVIGATION ACTIONS */}
          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
            {viewState === 'results' ? (
              <>
                <button
                  type="button"
                  onClick={handleEditFilters}
                  className="px-4 py-2.5 rounded-full border border-mood-forest/20 text-mood-forest font-bold text-sm hover:bg-mood-forest/5 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Edit Filters</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartFresh}
                  className="px-4 py-2.5 rounded-full border border-mood-black/15 text-mood-black/70 font-semibold text-sm hover:bg-mood-black/5 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>New Mix</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={generating}
                  className="px-5 py-2.5 rounded-full bg-mood-forest hover:bg-[#152e1b] text-mood-offwhite font-bold text-sm transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                  <span>{generating ? 'Regenerating...' : 'Regenerate Songs'}</span>
                </button>
              </>
            ) : (
              generatedResult && (
                <button
                  type="button"
                  onClick={() => setViewState('results')}
                  className="px-5 py-2.5 rounded-full bg-mood-forest text-mood-offwhite font-bold text-sm hover:bg-[#152e1b] transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span>View Generated Mix →</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* NOTIFICATIONS & MESSAGES */}
        {saveSuccessMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-sm font-semibold animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
            <button
              onClick={() => setCurrentView && setCurrentView('playlists')}
              className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              View in My Playlists →
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. BUILDER VIEW: FILTER FORM (Only rendered when viewState === 'builder') */}
        {viewState === 'builder' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-mood-black/10 shadow-sm space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-mood-black/5 pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-mood-forest" />
                <h2 className="text-lg font-bold text-mood-forest">Playlist Filters</h2>
              </div>
              <span className="text-xs text-mood-black/50">Configure your target mix</span>
            </div>

            {/* A. TARGET MOOD */}
            <div>
              <label className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2.5">
                Target Mood
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-10 gap-2">
                {MOODS.map(m => {
                  const isSelected = mood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMood(m.value)}
                      className={`py-2 px-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs scale-102'
                          : 'bg-mood-offwhite text-mood-black/70 border-mood-black/5 hover:border-mood-black/20 hover:text-mood-forest'
                      }`}
                    >
                      <span className="text-base">{m.emoji}</span>
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* B. GENRE, ENERGY & VOCALS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              
              {/* GENRE */}
              <div>
                <label htmlFor="genre-select" className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">
                  Genre
                </label>
                <select
                  id="genre-select"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full bg-mood-offwhite border border-mood-black/10 rounded-2xl px-4 py-2.5 text-sm font-semibold text-mood-forest focus:outline-hidden focus:ring-2 focus:ring-mood-forest/20 cursor-pointer"
                >
                  {GENRES.map(g => (
                    <option key={g} value={g}>{g === 'Any' ? 'Any Genre' : g}</option>
                  ))}
                </select>
              </div>

              {/* ENERGY LEVEL */}
              <div>
                <label className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">
                  Energy Level
                </label>
                <div className="grid grid-cols-4 gap-1.5 bg-mood-offwhite p-1 rounded-2xl border border-mood-black/10">
                  {ENERGIES.map(e => {
                    const isSelected = energy === e.value;
                    return (
                      <button
                        key={e.value}
                        type="button"
                        onClick={() => setEnergy(e.value)}
                        title={e.desc}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-mood-forest text-mood-offwhite shadow-xs'
                            : 'text-mood-black/70 hover:text-mood-forest'
                        }`}
                      >
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* VOCAL PREFERENCE */}
              <div>
                <label className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">
                  Vocal Preference
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-mood-offwhite p-1 rounded-2xl border border-mood-black/10">
                  {VOCAL_OPTIONS.map(v => {
                    const isSelected = vocalPreference === v.value;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setVocalPreference(v.value)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-mood-forest text-mood-offwhite shadow-xs'
                            : 'text-mood-black/70 hover:text-mood-forest'
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* C. DURATION & LANGUAGE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* DURATION SELECTION */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider">
                    Playlist Length
                  </label>
                  <span className="text-xs font-semibold text-mood-forest">
                    {effectiveDurationMinutes} Minutes
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {DURATION_PRESETS.map(d => {
                    const isSelected = !isCustomDuration && durationPreset === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDurationPreset(d);
                          setIsCustomDuration(false);
                        }}
                        className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs'
                            : 'bg-mood-offwhite text-mood-black/70 border-mood-black/5 hover:border-mood-black/20'
                        }`}
                      >
                        {d} min
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setIsCustomDuration(true)}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all border cursor-pointer ${
                      isCustomDuration
                        ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-xs'
                        : 'bg-mood-offwhite text-mood-black/70 border-mood-black/5 hover:border-mood-black/20'
                    }`}
                  >
                    Custom
                  </button>

                  {isCustomDuration && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={customDuration}
                        onChange={(e) => setCustomDuration(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-20 bg-mood-offwhite border border-mood-black/15 rounded-xl px-3 py-1.5 text-xs font-bold text-mood-forest"
                      />
                      <span className="text-xs text-mood-black/50 font-bold">min</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-mood-black/50 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-mood-forest/60 shrink-0" />
                  Calculated from song lengths. Previews count strictly as 30s.
                </p>
              </div>

              {/* LANGUAGE */}
              <div>
                <label htmlFor="language-select" className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">
                  Language
                </label>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-mood-offwhite border border-mood-black/10 rounded-2xl px-4 py-2.5 text-sm font-semibold text-mood-forest focus:outline-hidden focus:ring-2 focus:ring-mood-forest/20 cursor-pointer"
                >
                  {LANGUAGES.map(l => (
                    <option key={l} value={l}>{l === 'Any' ? 'Any Language' : l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* D. PERSONALIZATION & ADVANCED OPTIONS */}
            <div className="border-t border-mood-black/5 pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs font-bold text-mood-forest hover:text-mood-cobalt transition-colors cursor-pointer"
              >
                <span>Personalization</span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-mood-offwhite p-4 rounded-2xl border border-mood-black/5 animate-in fade-in">
                  <label className="flex items-center gap-2.5 text-xs font-semibold text-mood-black/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferFavoriteGenres}
                      onChange={(e) => setPreferFavoriteGenres(e.target.checked)}
                      className="rounded text-mood-forest focus:ring-mood-forest"
                    />
                    <span>Prefer genres from taste profile</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-mood-black/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferFavoriteArtists}
                      onChange={(e) => setPreferFavoriteArtists(e.target.checked)}
                      className="rounded text-mood-forest focus:ring-mood-forest"
                    />
                    <span>Boost saved favorite artists</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-mood-black/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeDisliked}
                      onChange={(e) => setExcludeDisliked(e.target.checked)}
                      className="rounded text-mood-forest focus:ring-mood-forest"
                    />
                    <span>Exclude disliked songs</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-mood-black/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeRecentlyRecommended}
                      onChange={(e) => setExcludeRecentlyRecommended(e.target.checked)}
                      className="rounded text-mood-forest focus:ring-mood-forest"
                    />
                    <span>Exclude recently recommended</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-semibold text-mood-black/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={artistDiversity}
                      onChange={(e) => setArtistDiversity(e.target.checked)}
                      className="rounded text-mood-forest focus:ring-mood-forest"
                    />
                    <span>Artist diversity (no single-artist domination)</span>
                  </label>
                </div>
              )}
            </div>

            {/* GENERATE BUTTON */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="w-full py-4 rounded-2xl bg-mood-forest hover:bg-[#152e1b] text-mood-offwhite font-bold text-base transition-all flex items-center justify-center gap-3 shadow-md disabled:opacity-60 disabled:cursor-not-allowed group cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin text-mood-lime" />
                    <span>Generating Playlist...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-mood-lime group-hover:rotate-12 transition-transform" />
                    <span>Generate Playlist</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 2. RESULTS VIEW: GENERATED PLAYLIST (Main content when viewState === 'results') */}
        {viewState === 'results' && generatedResult && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* PLAYLIST SUMMARY BANNER */}
            <div className="bg-gradient-to-r from-mood-forest to-[#1c3821] rounded-3xl p-6 sm:p-8 text-mood-offwhite shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
              <div className="space-y-3 relative z-10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-mood-lime text-mood-forest text-xs font-extrabold uppercase tracking-wider">
                    Smart Mix
                  </span>
                  {mood !== 'Any' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                      {mood}
                    </span>
                  )}
                  {genre !== 'Any' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                      {genre}
                    </span>
                  )}
                  {energy !== 'Any' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                      {energy} Energy
                    </span>
                  )}
                  {vocalPreference !== 'Any' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                      {vocalPreference}
                    </span>
                  )}
                  {language !== 'Any' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                      {language}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {savePlaylistName || generatedResult.title}
                </h2>
                
                <p className="text-sm text-mood-offwhite/80 max-w-2xl">
                  {generatedResult.summary}
                </p>

                {/* COMPOSITION & DURATION BADGES */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <span className="bg-white/15 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-mood-lime" /> {dynamicDurationFormatted}
                  </span>
                  <span className="bg-white/10 px-3 py-1 rounded-full font-semibold">
                    {editableTracks.length} Tracks
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-semibold">
                    {fullTracks.length} Full Tracks
                  </span>
                  {previewTracks.length > 0 && (
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full font-semibold">
                      {previewTracks.length} 30-sec Previews
                    </span>
                  )}
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePlayAll(false)}
                  disabled={editableTracks.length === 0}
                  className="px-5 py-2.5 rounded-full bg-mood-lime text-mood-forest font-bold text-sm hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-sm disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" /> Play All
                </button>

                <button
                  type="button"
                  onClick={() => handlePlayAll(true)}
                  disabled={editableTracks.length === 0}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" /> Shuffle
                </button>

                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(true)}
                  disabled={editableTracks.length === 0}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" /> Save Playlist
                </button>
              </div>
            </div>

            {/* DURATION NOTES CARD */}
            {generatedResult.durationNotes && (
              <div className="bg-mood-forest/5 border border-mood-forest/15 rounded-2xl p-4 flex items-start gap-3 text-xs text-mood-forest">
                <Info className="w-4 h-4 shrink-0 text-mood-forest mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Duration Notes: </span>
                  <span>{generatedResult.durationNotes}</span>
                </div>
              </div>
            )}

            {/* TRACKS LIST OR EMPTY STATE */}
            {editableTracks.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-mood-black/5 shadow-sm space-y-4">
                <Music className="w-12 h-12 text-mood-black/30 mx-auto" />
                <div>
                  <h3 className="text-lg font-bold text-mood-forest">No matching tracks found</h3>
                  <p className="text-sm text-mood-black/60 max-w-md mx-auto mt-1">
                    No songs matched all of your filter criteria. Try setting Genre or Language to 'Any', or adjusting your target energy level.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleEditFilters}
                    className="px-5 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl text-sm font-bold hover:bg-[#152e1b] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Sliders className="w-4 h-4" />
                    <span>Edit Filters</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartFresh}
                    className="px-4 py-2.5 border border-mood-black/15 text-mood-black/70 rounded-xl text-sm font-semibold hover:bg-mood-black/5 transition-colors cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-mood-black/5 shadow-sm divide-y divide-mood-black/5 overflow-hidden">
                <div className="p-4 bg-mood-offwhite/50 text-xs font-bold text-mood-forest uppercase tracking-wider flex items-center justify-between">
                  <span>Track Details ({editableTracks.length})</span>
                  <span>Audio & Actions</span>
                </div>

                {editableTracks.map((track, idx) => {
                  const trackId = track.id || track._id;
                  const isFav = favorites.has(trackId);
                  const isCurrent = currentSong && (currentSong.id === trackId || currentSong._id === trackId);
                  const isFull = track.playbackType === 'full';

                  return (
                    <div 
                      key={`${trackId}-${idx}`}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        isCurrent ? 'bg-mood-lime/10' : 'hover:bg-mood-black/[0.02]'
                      }`}
                    >
                      {/* Left Track Info */}
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="w-6 text-center text-xs font-mono text-mood-black/40">
                          {idx + 1}
                        </span>

                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-sm relative group">
                          <SongCover 
                            src={track.cover || track.albumArt} 
                            title={track.title} 
                            artist={track.artist}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handlePlaySong(track)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer"
                            title="Play Track"
                          >
                            <Play className="w-5 h-5 fill-current" />
                          </button>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 
                              onClick={() => handlePlaySong(track)}
                              className="font-bold text-mood-forest text-sm truncate hover:text-mood-cobalt cursor-pointer"
                            >
                              {track.title}
                            </h4>
                          </div>
                          
                          <p className="text-xs text-mood-black/60 truncate">{track.artist}</p>

                          {track.explanation && (
                            <p className="text-[11px] text-mood-forest/70 font-medium truncate mt-0.5">
                              {track.explanation}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Metadata & Controls */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        {/* Playback Badge */}
                        {isFull ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Full Track ({Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                            30-sec Preview
                          </span>
                        )}

                        {/* Source Tag */}
                        <span className="text-[10px] font-semibold text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded">
                          {track.sourceLabel || track.source}
                        </span>

                        {/* Play Button */}
                        <button
                          type="button"
                          onClick={() => handlePlaySong(track)}
                          className="p-2 rounded-xl bg-mood-forest/5 text-mood-forest hover:bg-mood-forest/15 transition-colors cursor-pointer"
                          title="Play Track"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>

                        {/* Add to Playlist */}
                        {onOpenAddToPlaylist && (
                          <button
                            type="button"
                            onClick={() => onOpenAddToPlaylist(track)}
                            className="p-2 rounded-xl text-mood-black/40 hover:text-mood-forest hover:bg-mood-black/5 transition-colors cursor-pointer"
                            title="Add to existing playlist"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}

                        {/* Toggle Favorite */}
                        {toggleFavorite && (
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(track, e)}
                            className="p-2 rounded-xl text-mood-black/40 hover:text-mood-mustard hover:bg-mood-black/5 transition-colors cursor-pointer"
                            title="Favorite track"
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                          </button>
                        )}

                        {/* Remove Track from Generated List */}
                        <button
                          type="button"
                          onClick={() => handleRemoveTrack(trackId)}
                          className="p-2 rounded-xl text-mood-black/40 hover:text-mood-sad hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remove from playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MODAL: SAVE PLAYLIST */}
        {isSaveModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-mood-black/10 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-mood-forest">Save Smart Playlist</h3>
                <button 
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="p-1 rounded-full text-mood-black/40 hover:text-mood-forest cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSavePlaylist} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">
                    Playlist Name
                  </label>
                  <input
                    type="text"
                    required
                    value={savePlaylistName}
                    onChange={(e) => setSavePlaylistName(e.target.value)}
                    placeholder="e.g. Energetic Bollywood Mix"
                    className="w-full bg-mood-offwhite border border-mood-black/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-mood-forest focus:outline-hidden focus:ring-2 focus:ring-mood-forest/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={savePlaylistDesc}
                    onChange={(e) => setSavePlaylistDesc(e.target.value)}
                    placeholder="Brief description of this playlist..."
                    className="w-full bg-mood-offwhite border border-mood-black/15 rounded-xl px-4 py-2 text-sm text-mood-forest focus:outline-hidden focus:ring-2 focus:ring-mood-forest/20 resize-none"
                  />
                </div>

                <div className="bg-mood-offwhite p-3 rounded-xl text-xs text-mood-black/60 space-y-1">
                  <div className="font-semibold text-mood-forest">Playlist Contents:</div>
                  <div>• {editableTracks.length} tracks ({dynamicDurationFormatted})</div>
                  <div>• {fullTracks.length} full-length tracks, {previewTracks.length} 30-sec previews</div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSaveModalOpen(false)}
                    className="px-4 py-2 text-sm font-bold text-mood-black/60 hover:text-mood-forest cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPlaylist || !savePlaylistName.trim()}
                    className="px-6 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl text-sm font-bold hover:bg-[#152e1b] transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    {savingPlaylist && <Loader className="w-4 h-4 animate-spin text-mood-lime" />}
                    <span>Save to My Playlists</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SmartPlaylistBuilder;
