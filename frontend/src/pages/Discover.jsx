import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, Play, Heart, Sparkles, Loader, Plus, 
  ListMusic, Clock, Radio, Check, Search, Music, X 
} from 'lucide-react';
import { featuredPlaylists } from '../utils/mockData';
import SongCover from '../components/SongCover';
import WhyThisSongModal from '../components/WhyThisSongModal';
import ListeningModeSelector from '../components/ListeningModeSelector';
import * as api from '../services/api';
import { getAiRecommendations } from '../services/api';

const Discover = ({ 
  songs = [], 
  searchQuery = '', 
  setSearchQuery,
  setCurrentSong, 
  setQueue,
  currentSong,
  globalMood, 
  setGlobalMood, 
  favorites = new Set(), 
  toggleFavorite, 
  setCurrentView, 
  listeningHistory = [],
  onOpenAddToPlaylist,
  onAddToQueue,
  onPlayNext
}) => {
  const moods = ['All', 'Happy', 'Sad', 'Calm', 'Energetic', 'Neutral'];
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSongs, setAiSongs] = useState([]);
  const [aiSource, setAiSource] = useState(null);
  const [aiProvider, setAiProvider] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [songForExplanation, setSongForExplanation] = useState(null);
  const [listeningMode, setListeningMode] = useState(null);
  
  // Filters
  const [genreFilter, setGenreFilter] = useState('All');
  const [languageFilter, setLanguageFilter] = useState('');
  const [playableOnly, setPlayableOnly] = useState(false);
  const [sortOption, setSortOption] = useState('recent'); // 'recent' or 'alpha'

  // Live search results
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef(null);
  const searchResultsRef = useRef(null);

  // Debounced search query fetching live tracks from iTunes & catalog
  useEffect(() => {
    const trimmed = (searchQuery || '').trim();
    if (!trimmed) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        let results = await api.searchSongs(trimmed, {
          language: languageFilter,
          mood: globalMood !== 'All' ? globalMood : '',
          genre: genreFilter !== 'All' ? genreFilter : '',
          limit: 30,
          signal: controller.signal
        });

        // If specific language or genre filter produced 0 results for this search term,
        // retry search across full catalog so user query isn't lost
        if ((!results || results.length === 0) && (languageFilter || genreFilter !== 'All')) {
          results = await api.searchSongs(trimmed, {
            limit: 30,
            signal: controller.signal
          });
        }

        if (searchAbortRef.current === controller) {
          setSearchResults(results);
          setIsSearching(false);
          // Scroll to search results view smoothly
          setTimeout(() => {
            if (searchResultsRef.current) {
              searchResultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Search error:', err);
        if (searchAbortRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, [searchQuery, languageFilter, globalMood, genreFilter]);

  const allGenres = useMemo(() => {
    const genres = new Set(songs.map(s => s.genre).filter(Boolean));
    return ['All', ...Array.from(genres).sort()];
  }, [songs]);

  // Combine songs: if searching, use searchResults (or fallback to filtered local songs)
  const candidateSongs = useMemo(() => {
    if (searchQuery && searchQuery.trim().length >= 1 && searchResults !== null) {
      return searchResults;
    }
    return songs;
  }, [songs, searchQuery, searchResults]);

  const filteredSongs = useMemo(() => {
    const isExplicitSearch = Boolean(searchQuery && searchQuery.trim().length >= 1 && searchResults !== null);

    let result = candidateSongs.filter(song => {
      // If candidateSongs came directly from the search API for this specific query,
      // it already matched the query! Do not drop results due to naive substring mismatch.
      if (!isExplicitSearch && searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = 
          (song.title && song.title.toLowerCase().includes(q)) || 
          (song.artist && song.artist.toLowerCase().includes(q)) ||
          (song.album && song.album.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      
      // If explicit search is active, do not hide results unless playableOnly is explicitly checked
      if (!isExplicitSearch) {
        const matchesMood = globalMood === 'All' || 
          (song.moods && song.moods.includes(globalMood)) || 
          song.mood === globalMood;
        if (!matchesMood) return false;

        const matchesGenre = genreFilter === 'All' || song.genre === genreFilter;
        if (!matchesGenre) return false;

        const matchesLanguage = !languageFilter || 
          (song.language && song.language.toLowerCase() === languageFilter.toLowerCase());
        if (!matchesLanguage) return false;
      }

      const isPlayable = Boolean(song.audioUrl || song.previewUrl) && song.isPlayable !== false;
      if (playableOnly && !isPlayable) return false;

      return true;
    });

    if (sortOption === 'alpha') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [candidateSongs, searchQuery, searchResults, globalMood, genreFilter, languageFilter, playableOnly, sortOption]);

  const handleAskAi = async (modeOverride = undefined) => {
    setIsAiLoading(true);
    setAiError(null);
    const effectiveMode = modeOverride !== undefined ? modeOverride : listeningMode;

    try {
      const favSongs = songs.filter(s => favorites.has(s._id || s.id));
      const favGenres = [...new Set(favSongs.map(s => s.genre).filter(Boolean))];
      const favArtists = [...new Set(favSongs.map(s => s.artist).filter(Boolean))];
      
      const recentHistory = (listeningHistory || []).slice(0, 15).map(h => ({
        id: h.songId || h.id,
        title: h.title,
        artist: h.artist,
        genre: h.genre,
        skipped: Boolean(h.skipped),
        completed: Boolean(h.completed),
        listenedDuration: h.listenedDuration || 0
      }));

      // Determine appropriate mood for API recommendation:
      // If globalMood is 'All', map based on effectiveMode, otherwise default to 'Happy'
      const targetMood = (globalMood && globalMood !== 'All')
        ? globalMood
        : (effectiveMode === 'Study' || effectiveMode === 'Sleep' || effectiveMode === 'Relax'
            ? 'Calm'
            : effectiveMode === 'Workout'
              ? 'Energetic'
              : 'Happy');

      const data = await getAiRecommendations(
        targetMood, 
        favGenres, 
        [...favorites], 
        recentHistory, 
        languageFilter,
        favArtists,
        effectiveMode
      );
      setAiSongs(data.recommendations || []);
      setAiSource(data.source);
      setAiProvider(data.provider);
    } catch (error) {
      console.error('Discover AI recommendation error:', error);
      setAiError(error.message || 'Failed to curate recommendations. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSelectListeningMode = (newMode) => {
    setListeningMode(newMode);
    handleAskAi(newMode);
  };

  // Recent unique songs from listening history - resolved to canonical catalog
  const recentPlayedSongs = useMemo(() => {
    if (!listeningHistory || listeningHistory.length === 0) return [];
    const seen = new Set();
    const list = [];
    for (const item of listeningHistory) {
      const id = item.songId || item._id;
      if (!seen.has(id)) {
        seen.add(id);
        const canonical = (songs || []).find(s => (s._id || s.id) === id || (s.title && s.title.toLowerCase() === (item.title || '').toLowerCase()));
        if (canonical) {
          list.push(canonical);
        } else {
          list.push({
            _id: id,
            id: id,
            title: item.title,
            artist: item.artist,
            cover: item.cover,
            albumArt: item.cover,
            audioUrl: item.audioUrl,
            previewUrl: item.audioUrl,
            isPlayable: Boolean(item.audioUrl),
            genre: item.genre,
            mood: item.mood
          });
        }
        if (list.length >= 6) break;
      }
    }
    return list;
  }, [listeningHistory, songs]);

  return (
    <div className="pb-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-12">
        
        {/* Welcome Hero Section */}
        <section className="bg-mood-forest rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 w-80 h-80 bg-mood-lime/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-mood-cobalt/20 rounded-full blur-3xl -ml-10 -mb-10"></div>
          
          <div className="relative z-10 space-y-4 max-w-xl">
            <h2 className="text-3xl md:text-5xl font-extrabold text-mood-offwhite tracking-tight leading-tight">
              Music for the way you feel.
            </h2>
            <p className="text-mood-offwhite/85 text-base md:text-lg leading-relaxed">
              Detect your mood with your webcam, select how you feel manually, or explore recommendations tuned to your listening taste.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button 
                onClick={() => setCurrentView && setCurrentView('mood-studio')}
                className="bg-mood-lime text-mood-forest px-6 py-3 rounded-full font-extrabold hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-sm text-sm"
              >
                <Camera className="w-4 h-4" />
                Mood Studio
              </button>
              <button 
                onClick={() => setCurrentView && setCurrentView('mood-mix')}
                className="bg-white/10 text-white hover:bg-white/20 px-5 py-3 rounded-full font-bold transition-all text-sm flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-mood-lime" /> Listening Mix
              </button>
            </div>
          </div>
          
          <div className="relative z-10 w-full md:w-auto flex justify-center md:justify-end">
            <div className="w-48 h-48 md:w-56 md:h-56 rounded-3xl bg-gradient-to-tr from-mood-cobalt/40 to-mood-mustard/40 backdrop-blur-md border border-white/15 flex items-center justify-center shadow-2xl rotate-2">
               <div className="w-32 h-32 rounded-full bg-mood-offwhite/15 flex items-center justify-center animate-pulse">
                  <Play className="w-12 h-12 text-mood-offwhite opacity-90 ml-1.5 fill-current" />
               </div>
            </div>
          </div>
        </section>

        {/* Recently Played Row (if available) */}
        {recentPlayedSongs.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-mood-cobalt" />
                <h3 className="text-lg font-bold text-mood-forest">Recently Played</h3>
              </div>
              <button
                onClick={() => setCurrentView && setCurrentView('history')}
                className="text-xs font-bold text-mood-cobalt hover:underline"
              >
                View Full History →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {recentPlayedSongs.map((song) => {
                const sId = song._id || song.id;
                return (
                  <div
                    key={sId}
                    onClick={() => {
                      if (setQueue && recentPlayedSongs) setQueue(recentPlayedSongs);
                      setCurrentSong(song);
                    }}
                    className="bg-white rounded-2xl p-3 border border-mood-black/5 hover:border-mood-black/15 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="aspect-square w-full rounded-xl overflow-hidden mb-2 relative">
                      <SongCover 
                        src={song.cover || song.albumArt} 
                        title={song.title} 
                        artist={song.artist}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-5 h-5 text-white ml-0.5 fill-current" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-mood-forest text-xs truncate group-hover:text-mood-cobalt">{song.title}</h4>
                      <p className="text-[11px] text-mood-black/60 truncate">{song.artist}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Mood Selection & Filter Toolbar */}
        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <h3 className="text-xl font-bold text-mood-forest mb-3">How are you feeling?</h3>
              <div className="flex flex-wrap gap-2">
                {moods.map(mood => (
                  <button
                    key={mood}
                    onClick={() => setGlobalMood(mood)}
                    className={`px-5 py-2 rounded-full text-xs md:text-sm font-bold transition-all border ${
                      globalMood === mood
                        ? 'bg-mood-cobalt text-mood-offwhite border-mood-cobalt shadow-sm'
                        : 'bg-white text-mood-black/70 border-mood-black/10 hover:border-mood-cobalt/50 hover:text-mood-cobalt'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Filter Dropdowns & Toggles */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Playable Only Toggle */}
              <button
                type="button"
                onClick={() => setPlayableOnly(!playableOnly)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  playableOnly
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-mood-black/60 border-mood-black/10 hover:border-mood-black/20'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Playable Only</span>
              </button>

              <select 
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className="px-3.5 py-2 bg-white border border-mood-black/10 rounded-xl text-xs font-semibold text-mood-black/70 focus:outline-none focus:border-mood-cobalt cursor-pointer"
                aria-label="Filter by genre"
              >
                {allGenres.map(genre => (
                  <option key={genre} value={genre}>{genre === 'All' ? 'All Genres' : genre}</option>
                ))}
              </select>

              <select 
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="px-3.5 py-2 bg-white border border-mood-black/10 rounded-xl text-xs font-semibold text-mood-black/70 focus:outline-none focus:border-mood-cobalt cursor-pointer"
                aria-label="Filter by language"
              >
                <option value="">Any Language</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Punjabi">Punjabi</option>
              </select>

              <select 
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="px-3.5 py-2 bg-white border border-mood-black/10 rounded-xl text-xs font-semibold text-mood-black/70 focus:outline-none focus:border-mood-cobalt cursor-pointer"
                aria-label="Sort tracks"
              >
                <option value="recent">Recently Added</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </div>
        </section>

        {/* AI Curated Recommendation Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-mood-forest">
                {globalMood === 'All' ? 'Recommended for You' : `${globalMood} Soundtrack`}
              </h3>
              <p className="text-xs text-mood-black/50 mt-0.5">
                Verified 30-second previews and catalog entries
              </p>
            </div>
            
            <button 
              onClick={() => handleAskAi()}
              disabled={isAiLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-mood-cobalt text-white rounded-full font-bold hover:bg-mood-cobalt/90 transition-all disabled:opacity-50 text-xs md:text-sm shadow-sm"
            >
              {isAiLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-mood-lime" />}
              {isAiLoading ? 'Curating Mix...' : 'Curate AI Recommendations'}
            </button>
          </div>

          {/* Smart Listening Mode Selector */}
          <div className="bg-white p-4 rounded-3xl border border-mood-black/5 shadow-xs">
            <ListeningModeSelector 
              activeMode={listeningMode}
              onSelectMode={handleSelectListeningMode}
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
              listeningHistory={listeningHistory}
              currentSong={currentSong}
            />
          </div>

          {aiError && (
            <div className="w-full p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm">
              {aiError}
            </div>
          )}

          {/* AI Recommended candidates */}
          {aiSongs.length > 0 && (
            <div className="bg-mood-cobalt/[0.03] p-6 rounded-3xl border border-mood-cobalt/15 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-mood-cobalt">
                  <Sparkles className="w-4 h-4" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider">
                    {aiProvider === 'gemini' ? 'Gemini AI Curated Mix' : 'Moodify Personalized Mix'}
                  </h4>
                </div>
                <span className="text-xs text-mood-black/50 font-medium">
                  {aiSongs.length} tracks ranked for your {globalMood} mood
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {aiSongs.map(song => {
                  const songId = song._id || song.id;
                  const isPlayable = Boolean(song.audioUrl || song.isPlayable || song.youtubeId);
                  const isFav = favorites.has(songId);

                  return (
                    <div 
                      key={songId} 
                      className="group bg-white rounded-2xl p-4 border border-mood-black/5 hover:border-mood-cobalt/30 hover:shadow-md transition-all flex items-center justify-between gap-3"
                    >
                      <div 
                        onClick={() => {
                          if (setQueue && aiSongs) setQueue(aiSongs);
                          setCurrentSong(song);
                        }}
                        className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-sm">
                          <SongCover 
                            src={song.cover || song.albumArt} 
                            title={song.title} 
                            artist={song.artist}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5 fill-current" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-bold text-mood-forest text-sm truncate group-hover:text-mood-cobalt transition-colors">
                            {song.title}
                          </h4>
                          <p className="text-xs text-mood-black/60 truncate mt-0.5">{song.artist}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {/* Provider Source Badge */}
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                              song.provider === 'audius'
                                ? 'text-purple-700 bg-purple-50 border-purple-200'
                                : song.provider === 'jamendo'
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                : song.provider === 'itunes'
                                ? 'text-blue-700 bg-blue-50 border-blue-200'
                                : 'text-slate-700 bg-slate-50 border-slate-200'
                            }`}>
                              {song.sourceLabel || (song.provider === 'audius' ? 'Audius' : song.provider === 'jamendo' ? 'Jamendo' : song.provider === 'itunes' ? 'iTunes' : 'Moodify')}
                            </span>
                            {song.isFullAudio || (song.playbackType === 'full' && song.audioUrl) ? (
                              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300/60">
                                Full Track
                              </span>
                            ) : song.audioUrl || song.previewUrl ? (
                              <span className="text-[9px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-1.5 py-0.2 rounded border border-mood-cobalt/20">
                                30-sec Preview
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300/60">
                                Metadata Only
                              </span>
                            )}
                            {song.genre && (
                              <span className="text-[9px] text-mood-black/50 bg-mood-black/5 px-1.5 py-0.2 rounded truncate max-w-[80px]">
                                {song.genre}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {onOpenAddToPlaylist && (
                          <button
                            onClick={() => onOpenAddToPlaylist(song)}
                            className="p-1.5 text-mood-black/30 hover:text-mood-cobalt transition-colors"
                            title="Add to Playlist"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        {onAddToQueue && (
                          <button
                            onClick={() => onAddToQueue(song)}
                            className="p-1.5 text-mood-black/30 hover:text-mood-forest transition-colors"
                            title="Add to Queue"
                          >
                            <ListMusic className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSongForExplanation(song)}
                          className="p-1.5 text-mood-black/30 hover:text-mood-cobalt transition-colors"
                          title="Why this song?"
                          aria-label="Why this song?"
                        >
                          <Sparkles className="w-4 h-4 text-mood-cobalt" />
                        </button>
                        <button 
                          onClick={(e) => toggleFavorite(song, e)}
                          className="p-1.5 text-mood-black/30 hover:text-mood-mustard transition-colors"
                          title="Favorite"
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Explainable recommendation modal */}
          <WhyThisSongModal 
            song={songForExplanation}
            isOpen={Boolean(songForExplanation)}
            onClose={() => setSongForExplanation(null)}
            onPlay={(s) => {
              if (setQueue && aiSongs) setQueue(aiSongs);
              setCurrentSong(s);
            }}
          />
          
          {/* Main Song Catalog Grid */}
          {searchQuery && (
            <div ref={searchResultsRef} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-mood-black/10 scroll-mt-24">
              <div className="flex items-center gap-2.5">
                <Search className="w-5 h-5 text-mood-cobalt" />
                <h3 className="text-xl md:text-2xl font-black text-mood-forest">
                  Search Results for <span className="text-mood-cobalt">"{searchQuery}"</span>
                </h3>
                {!isSearching && (
                  <span className="text-xs text-mood-forest/80 font-bold bg-mood-cobalt/10 border border-mood-cobalt/20 px-2.5 py-0.5 rounded-full">
                    {filteredSongs.length} {filteredSongs.length === 1 ? 'track' : 'tracks'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery && setSearchQuery('')}
                className="text-xs font-bold text-mood-black/50 hover:text-rose-600 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear Search
              </button>
            </div>
          )}

          {isSearching ? (
            <div className="py-16 flex flex-col items-center justify-center text-mood-black/40">
              <Loader className="w-8 h-8 animate-spin text-mood-cobalt mb-2" />
              <p className="text-xs font-semibold">Searching verified preview tracks...</p>
            </div>
          ) : filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredSongs.map(song => {
                const songId = song._id || song.id;
                const isPlayable = Boolean(song.audioUrl || song.isPlayable || song.youtubeId);
                const isFav = favorites.has(songId);

                return (
                  <div 
                    key={songId}
                    data-song-card="true"
                    className="group bg-white rounded-3xl p-4 border border-mood-black/5 hover:border-mood-black/15 hover:shadow-lg transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-mood-black/5">
                        <SongCover 
                          src={song.cover || song.albumArt} 
                          title={song.title} 
                          artist={song.artist}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <button 
                          onClick={() => {
                            if (setQueue && filteredSongs) setQueue(filteredSongs);
                            setCurrentSong(song);
                          }}
                          className="absolute inset-0 bg-mood-forest/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title={isPlayable ? "Play 30s Preview" : "Play Track"}
                        >
                          <div className="w-12 h-12 bg-mood-lime rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                            <Play className="w-6 h-6 text-mood-forest ml-0.5 fill-current" />
                          </div>
                        </button>
                      </div>
                      
                      <div>
                        <h4 
                          onClick={() => {
                            if (setQueue && filteredSongs) setQueue(filteredSongs);
                            setCurrentSong(song);
                          }}
                          className="font-bold text-mood-forest text-sm truncate hover:text-mood-cobalt cursor-pointer"
                        >
                          {song.title}
                        </h4>
                        <p className="text-xs text-mood-black/60 truncate mt-0.5">{song.artist}</p>
                        
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {song.isFullAudio || (song.playbackType === 'full' && song.audioUrl) ? (
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300/60">
                              Full Audio
                            </span>
                          ) : song.audioUrl || song.previewUrl ? (
                            <span className="text-[9px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-2 py-0.5 rounded border border-mood-cobalt/20">
                              30s Preview
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300/60">
                              Metadata Only
                            </span>
                          )}
                          {song.language && (
                            <span className="text-[9px] font-semibold text-mood-cobalt/80 bg-mood-cobalt/5 px-2 py-0.5 rounded">
                              {song.language}
                            </span>
                          )}
                          {song.genre && (
                            <span className="text-[9px] text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded truncate max-w-[80px]">
                              {song.genre}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 mt-3 border-t border-mood-black/5 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {onOpenAddToPlaylist && (
                          <button
                            onClick={() => onOpenAddToPlaylist(song)}
                            className="p-1.5 text-mood-black/40 hover:text-mood-cobalt hover:bg-mood-black/5 rounded-lg transition-colors"
                            title="Add to Playlist"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        {onAddToQueue && (
                          <button
                            onClick={() => onAddToQueue(song)}
                            className="p-1.5 text-mood-black/40 hover:text-mood-forest hover:bg-mood-black/5 rounded-lg transition-colors"
                            title="Add to Queue"
                          >
                            <ListMusic className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <button 
                        onClick={(e) => toggleFavorite(song, e)}
                        className="p-1.5 text-mood-black/30 hover:text-mood-mustard transition-colors"
                        title="Favorite"
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-mood-black/5 border-dashed p-8 space-y-2">
              <Search className="w-8 h-8 text-mood-black/30 mb-1" />
              <h4 className="font-bold text-mood-forest text-base">
                {searchQuery ? `No tracks found matching "${searchQuery}"` : 'No tracks found matching your selected filters.'}
              </h4>
              <p className="text-xs text-mood-black/50 max-w-md">
                {searchQuery 
                  ? 'We could not find matching tracks in the catalog or live streaming previews. Try searching by artist (e.g. Arijit Singh), song title (e.g. Tum Hi Ho, Channa Mereya), or genre.' 
                  : 'Try selecting a different mood, genre, or clearing language filters.'}
              </p>
              <button 
                onClick={() => { 
                  if (setSearchQuery) setSearchQuery(''); 
                  setGlobalMood('All'); 
                  setGenreFilter('All'); 
                  setLanguageFilter(''); 
                  setPlayableOnly(false);
                }}
                className="mt-3 px-5 py-2.5 bg-mood-cobalt text-white rounded-full text-xs font-bold hover:bg-mood-cobalt/90 transition-all cursor-pointer shadow-sm"
              >
                Reset All Filters & Search
              </button>
            </div>
          )}
        </section>

        {/* Featured Playlists */}
        <section className="space-y-6">
          <div>
            <h3 className="text-xl font-bold text-mood-forest">Curated Mood Collections</h3>
            <p className="text-xs text-mood-black/50 mt-0.5">Handpicked thematic playlists</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featuredPlaylists.map(playlist => (
              <div 
                key={playlist.id} 
                className="relative h-60 rounded-3xl overflow-hidden group cursor-pointer shadow-sm"
              >
                <img 
                  src={playlist.cover} 
                  alt={playlist.title} 
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-mood-forest/90 via-mood-forest/40 to-transparent"></div>
                
                <div className="absolute bottom-0 left-0 right-0 p-8 flex items-end justify-between">
                  <div className="max-w-[75%]">
                    <h4 className="text-2xl font-bold text-mood-offwhite mb-1.5">{playlist.title}</h4>
                    <p className="text-mood-offwhite/80 text-xs line-clamp-2">{playlist.description}</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (setCurrentView) setCurrentView('mood-studio');
                    }}
                    className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:bg-mood-lime transition-colors shrink-0"
                  >
                    <Play className="w-5 h-5 text-mood-forest ml-0.5 fill-current" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};

export default Discover;
