import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Play, Shuffle, ListPlus, Clock, 
  Flame, Radio, Heart, Calendar, Music, AlertCircle, Loader, Check 
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const RANGE_OPTIONS = [
  { label: 'Last 1 Day', value: '1d' },
  { label: 'Last 2 Days', value: '2d' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 8 Days', value: '8d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Custom Range', value: 'custom' },
];

const MoodMix = ({ 
  setCurrentSong, 
  setQueue, 
  favorites = new Set(), 
  toggleFavorite, 
  onOpenAddToPlaylist, 
  setCurrentView,
  user
}) => {
  const [selectedRange, setSelectedRange] = useState('7d');
  const [mode, setMode] = useState('smart-mix'); // 'from-listening' | 'smart-mix'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [loading, setLoading] = useState(false);
  const [recapData, setRecapData] = useState(null);
  const [error, setError] = useState(null);
  
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);

  const isListeningMode = mode === 'from-listening' || mode === 'listening';

  const fetchRecap = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getListeningRecap({
        range: selectedRange,
        mode: isListeningMode ? 'from-listening' : 'smart-mix',
        from: selectedRange === 'custom' ? customFrom : undefined,
        to: selectedRange === 'custom' ? customTo : undefined,
      });
      setRecapData(data);
    } catch (err) {
      console.warn('Recap fetch error:', err);
      setError('Unable to load listening recap. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRange === 'custom' && (!customFrom || !customTo)) {
      return; // wait for both dates
    }
    fetchRecap();
  }, [selectedRange, mode, customFrom, customTo, user]);

  const formatListeningTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0 min';
    const s = Math.round(seconds);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      return `${h}h ${m % 60}m`;
    }
    return `${m}m ${s % 60}s`;
  };

  const recap = recapData?.recap || recapData?.stats || {
    totalListenedSeconds: 0,
    totalPlays: 0,
    repeatedPlays: 0,
    topSongs: [],
    topArtists: [],
    topGenres: [],
    likedInPeriod: 0
  };

  const playlist = recapData?.playlist || recapData?.generatedPlaylist || [];

  const handlePlayAll = (shuffle = false) => {
    if (!playlist || playlist.length === 0) return;
    let list = [...playlist];
    if (shuffle) {
      list.sort(() => Math.random() - 0.5);
    }
    if (setQueue) setQueue(list);
    setCurrentSong(list[0]);
  };

  const handleSaveAsPlaylist = async () => {
    if (!playlist || playlist.length === 0) return;
    setSavingPlaylist(true);
    try {
      const rangeLabel = RANGE_OPTIONS.find(r => r.value === selectedRange)?.label || selectedRange;
      const modeLabel = isListeningMode ? 'Listening Recap' : 'Smart Mix';
      const created = await api.createPlaylist({
        name: `${modeLabel} (${rangeLabel})`,
        description: `Generated from your listening activity (${rangeLabel})`,
        songs: playlist
      });
      setSaveSuccess(`Saved "${created.name}" to your playlists!`);
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err) {
      alert(err.message || 'Failed to save playlist');
    } finally {
      setSavingPlaylist(false);
    }
  };

  const hasHistory = (recap.totalPlays > 0 || recap.totalListens > 0) || playlist.length > 0;

  return (
    <div className="pb-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-8">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-mood-forest via-[#193d20] to-[#0f2815] rounded-3xl p-8 md:p-10 text-mood-offwhite shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-80 h-80 bg-mood-lime/15 rounded-full blur-3xl -mr-20 -mt-20"></div>
          
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-mood-lime/20 border border-mood-lime/30 flex items-center justify-center shrink-0 shadow-inner">
              <Sparkles className="w-12 h-12 text-mood-lime" />
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-extrabold tracking-widest text-mood-lime">Personalized</span>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Listening Mix & Recap</h1>
              <p className="text-mood-offwhite/80 text-sm max-w-xl">
                Generate personalized mixes and recap insights powered by your actual listening habits, repeat counts, and taste.
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handlePlayAll(false)}
              disabled={playlist.length === 0}
              className="px-6 py-3 rounded-full bg-mood-lime text-mood-forest font-bold text-sm hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" /> Play Mix
            </button>
            <button
              onClick={() => handlePlayAll(true)}
              disabled={playlist.length === 0}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-4 h-4" /> Shuffle
            </button>
            <button
              onClick={handleSaveAsPlaylist}
              disabled={playlist.length === 0 || savingPlaylist}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ListPlus className="w-4 h-4" /> Save as Playlist
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-sm font-semibold flex items-center gap-2 animate-in fade-in">
            <Check className="w-5 h-5 text-emerald-600" />
            {saveSuccess}
          </div>
        )}

        {/* Filter Controls: Ranges & Modes */}
        <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-sm space-y-6">
          
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">Mix Strategy</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <button
                type="button"
                onClick={() => setMode('from-listening')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  isListeningMode
                    ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-sm'
                    : 'bg-white text-mood-forest border-mood-black/10 hover:bg-mood-black/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm">From My Listening</h4>
                  {isListeningMode && <Check className="w-4 h-4 text-mood-lime" />}
                </div>
                <p className={`text-xs ${isListeningMode ? 'text-mood-offwhite/80' : 'text-mood-black/60'}`}>
                  Exclusively contains songs you actually played or liked in this timeframe. No unplayed tracks.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('smart-mix')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  !isListeningMode
                    ? 'bg-mood-forest text-mood-offwhite border-mood-forest shadow-sm'
                    : 'bg-white text-mood-forest border-mood-black/10 hover:bg-mood-black/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm">Smart Mix</h4>
                  {!isListeningMode && <Check className="w-4 h-4 text-mood-lime" />}
                </div>
                <p className={`text-xs ${!isListeningMode ? 'text-mood-offwhite/80' : 'text-mood-black/60'}`}>
                  Blends your most-played tracks with fresh playable recommendations tailored to your top genres.
                </p>
              </button>
            </div>
          </div>

          {/* Date Range Selector */}
          <div>
            <label className="block text-xs font-bold text-mood-forest uppercase tracking-wider mb-2">Timeframe</label>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedRange(opt.value)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    selectedRange === opt.value
                      ? 'bg-mood-cobalt text-white border-mood-cobalt shadow-sm'
                      : 'bg-mood-black/5 text-mood-forest border-transparent hover:bg-mood-black/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {selectedRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-mood-black/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mood-black/60 font-medium">From:</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="px-3 py-1.5 bg-mood-black/5 border border-mood-black/10 rounded-xl text-xs font-medium text-mood-forest focus:outline-none focus:border-mood-cobalt"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mood-black/60 font-medium">To:</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="px-3 py-1.5 bg-mood-black/5 border border-mood-black/10 rounded-xl text-xs font-medium text-mood-forest focus:outline-none focus:border-mood-cobalt"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-16 flex flex-col items-center justify-center text-mood-black/40">
            <Loader className="w-8 h-8 animate-spin text-mood-cobalt mb-3" />
            <p className="text-sm font-semibold">Analyzing listening history & generating mix...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm">
            {error}
          </div>
        )}

        {/* Insights / Stats Grid */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-mood-black/5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-mood-forest/60">
                <span className="text-xs font-bold uppercase tracking-wider">Listening Time</span>
                <Clock className="w-4 h-4 text-mood-cobalt" />
              </div>
              <p className="text-2xl font-extrabold text-mood-forest">
                {formatListeningTime(recap.totalListenedSeconds)}
              </p>
              <p className="text-[11px] text-mood-black/50">In selected period</p>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-mood-black/5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-mood-forest/60">
                <span className="text-xs font-bold uppercase tracking-wider">Total Plays</span>
                <Play className="w-4 h-4 text-mood-forest" />
              </div>
              <p className="text-2xl font-extrabold text-mood-forest">{recap.totalPlays || 0}</p>
              <p className="text-[11px] text-mood-black/50">
                {recap.repeatedPlays || 0} repeat listens
              </p>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-mood-black/5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-mood-forest/60">
                <span className="text-xs font-bold uppercase tracking-wider">Top Artist</span>
                <Flame className="w-4 h-4 text-mood-mustard" />
              </div>
              <p className="text-lg font-extrabold text-mood-forest truncate">
                {recap.topArtists && recap.topArtists[0] ? (recap.topArtists[0].artist || recap.topArtists[0].name) : 'No data yet'}
              </p>
              <p className="text-[11px] text-mood-black/50">
                {recap.topArtists && recap.topArtists[0] ? `${recap.topArtists[0].count} plays` : 'Start listening'}
              </p>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-mood-black/5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-mood-forest/60">
                <span className="text-xs font-bold uppercase tracking-wider">Top Genre</span>
                <Radio className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-lg font-extrabold text-mood-forest truncate">
                {recap.topGenres && recap.topGenres[0] ? (recap.topGenres[0].genre || recap.topGenres[0].name) : 'Eclectic'}
              </p>
              <p className="text-[11px] text-mood-black/50">
                {recap.topGenres && recap.topGenres[0] ? `${recap.topGenres[0].count} plays` : 'Discovered vibes'}
              </p>
            </div>
          </div>
        )}

        {/* Generated Playlist Tracks */}
        {!loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-mood-forest">
                  Generated {isListeningMode ? 'Listening Recap' : 'Smart Mix'}
                </h3>
                <p className="text-xs text-mood-black/60">
                  {playlist.length} tracks • {isListeningMode ? 'Curated from your activity' : 'Your favorites + curated playable recommendations'}
                </p>
              </div>
            </div>

            {playlist.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-3xl border border-mood-black/5 p-8 shadow-sm">
                <Music className="w-12 h-12 text-mood-black/30 mx-auto mb-3" />
                <h4 className="text-lg font-bold text-mood-forest mb-1">No Activity In This Timeframe</h4>
                <p className="text-sm text-mood-black/60 max-w-md mx-auto mb-6">
                  {isListeningMode
                    ? "You haven't listened to tracks during this period. Try expanding the timeframe or switch to Smart Mix!"
                    : "No listening history found for this period. Play a few songs in Discover to seed your smart mix!"}
                </p>
                <button
                  onClick={() => setCurrentView && setCurrentView('discover')}
                  className="px-5 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl text-sm font-bold hover:bg-mood-forest/90 transition-colors"
                >
                  Discover Music Now
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-mood-black/5 shadow-sm divide-y divide-mood-black/5 overflow-hidden">
                {playlist.map((song, idx) => {
                  const songId = song._id || song.id || song.songId;
                  const isFav = favorites.has(songId);
                  const isRecommendation = Boolean(song.isRecommendation);
                  const hasAudio = Boolean(song.audioUrl || song.isPlayable);

                  return (
                    <div
                      key={`${songId}-${idx}`}
                      className="p-4 flex items-center justify-between hover:bg-mood-black/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="w-6 text-center text-xs font-mono text-mood-black/40 group-hover:hidden">
                          {idx + 1}
                        </span>
                        <button
                          onClick={() => {
                            if (setQueue) setQueue(playlist);
                            setCurrentSong(song);
                          }}
                          className="w-6 hidden group-hover:flex items-center justify-center text-mood-forest hover:text-mood-cobalt"
                          title="Play"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>

                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-sm">
                          <SongCover 
                            src={song.cover || song.albumArt} 
                            title={song.title} 
                            artist={song.artist}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="min-w-0">
                          <h4
                            onClick={() => {
                              if (setQueue) setQueue(playlist);
                              setCurrentSong(song);
                            }}
                            className="font-bold text-mood-forest text-sm truncate hover:text-mood-cobalt cursor-pointer"
                          >
                            {song.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-mood-black/60 truncate">{song.artist}</span>
                            {song.genre && (
                              <span className="text-[10px] text-mood-black/40 bg-mood-black/5 px-1.5 py-0.2 rounded hidden sm:inline-block">
                                {song.genre}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Recommendation vs History Badge */}
                        {isRecommendation ? (
                          <span className="text-[10px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Recommended
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-mood-forest bg-mood-forest/10 px-2 py-0.5 rounded-full">
                            From History
                          </span>
                        )}

                        {hasAudio ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50 hidden sm:inline-block">
                            30s Preview
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded hidden sm:inline-block">
                            Metadata
                          </span>
                        )}

                        {onOpenAddToPlaylist && (
                          <button
                            onClick={() => onOpenAddToPlaylist(song)}
                            className="p-1.5 text-mood-black/30 hover:text-mood-cobalt transition-colors"
                            title="Add to Playlist"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                        )}

                        {toggleFavorite && (
                          <button
                            onClick={(e) => toggleFavorite(song, e)}
                            className="p-1.5 text-mood-black/30 hover:text-mood-mustard transition-colors"
                            title="Favorite"
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default MoodMix;
