import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Sparkles, LogOut, X, Loader, Play, Music, ArrowRight } from 'lucide-react';
import * as api from '../services/api';
import SongCover from './SongCover';

const Header = ({ 
  searchQuery, 
  setSearchQuery, 
  setCurrentSong,
  setQueue,
  user, 
  setCurrentView, 
  onLogout 
}) => {
  const [inputValue, setInputValue] = useState(searchQuery || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync internal input value if external searchQuery changes (e.g., cleared elsewhere)
  useEffect(() => {
    setInputValue(searchQuery || '');
  }, [searchQuery]);

  // Click outside listener to dismiss suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced live suggestion fetching with stale request cancellation
  useEffect(() => {
    const trimmed = inputValue.trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (trimmed.length < 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSuggestions([]);
      setIsSearching(false);
      setSearchError(null);
      setSelectedIndex(-1);
      return;
    }

    setShowDropdown(true);
    setIsSearching(true);
    setSearchError(null);

    debounceTimerRef.current = setTimeout(async () => {
      // Abort any in-flight request before launching new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const results = await api.searchSongs(trimmed, {
          limit: 6,
          signal: controller.signal
        });
        setSuggestions(Array.isArray(results) ? results : []);
        setSearchError(null);
      } catch (err) {
        if (err.name === 'AbortError') {
          // Stale request cancelled; ignore
          return;
        }
        console.warn('Live suggestions error:', err);
        setSearchError('Suggestions unavailable. Press Enter to search.');
        setSuggestions([]);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Form submission handler (Enter key or search button click)
  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    const trimmed = inputValue.trim();

    // Abort pending suggestion request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setShowDropdown(false);
    setSelectedIndex(-1);

    if (setSearchQuery) {
      setSearchQuery(trimmed);
    }

    // Always navigate to Discover view to see results
    if (setCurrentView) {
      setCurrentView('discover');
    }
  };

  // Selecting a song from live suggestions
  const handleSelectSong = (song) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setShowDropdown(false);
    setSelectedIndex(-1);

    // Play song immediately using shared audio engine
    if (setCurrentSong) {
      setCurrentSong(song);
    }

    // Add to shared queue
    if (setQueue) {
      const remaining = suggestions.filter(s => (s._id || s.id) !== (song._id || song.id));
      setQueue([song, ...remaining]);
    }

    // Set search query so full artist/track catalog is displayed in Discover
    const searchTerm = song.title || song.artist || inputValue.trim();
    setInputValue(searchTerm);
    if (setSearchQuery) {
      setSearchQuery(searchTerm);
    }

    if (setCurrentView) {
      setCurrentView('discover');
    }
  };

  // Keyboard navigation inside search dropdown
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setSelectedIndex(-1);
      return;
    }

    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      e.preventDefault();
      handleSelectSong(suggestions[selectedIndex]);
    }
  };

  const handleClear = () => {
    setInputValue('');
    if (setSearchQuery) {
      setSearchQuery('');
    }
    setSuggestions([]);
    setShowDropdown(false);
    setSelectedIndex(-1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <header className="h-20 px-4 md:px-8 flex items-center justify-between border-b border-mood-black/10 bg-mood-offwhite sticky top-0 z-40">
      
      {/* Search Input Container & Live Suggestions */}
      <div ref={containerRef} className="relative w-full max-w-xs sm:max-w-md">
        <form onSubmit={handleSubmit} className="relative w-full">
          {/* Submit Search Button (Left Icon) */}
          <button
            type="submit"
            aria-label="Submit search"
            title="Search tracks and artists"
            className="absolute inset-y-0 left-0 pl-3.5 pr-1 flex items-center text-mood-black/40 hover:text-mood-cobalt transition-colors cursor-pointer z-10"
          >
            <Search className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          {/* Search Text Input */}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-label="Search by title or artist"
            placeholder="Search by title or artist..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              if (inputValue.trim().length >= 2) {
                setShowDropdown(true);
              }
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-mood-black/5 border border-transparent text-mood-black rounded-full py-2.5 pl-10 md:pl-11 pr-10 focus:outline-none focus:bg-white focus:border-mood-cobalt/30 focus:ring-2 focus:ring-mood-cobalt/10 transition-all text-xs md:text-sm placeholder:text-mood-black/40 shadow-xs"
          />

          {/* Right Action: Loading Spinner or Clear Button */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5 z-10">
            {isSearching && (
              <Loader className="w-4 h-4 text-mood-cobalt animate-spin" />
            )}
            {inputValue && !isSearching && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                title="Clear search"
                className="p-1 rounded-full text-mood-black/40 hover:text-mood-forest hover:bg-mood-black/10 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>

        {/* Live Suggestions Dropdown */}
        {showDropdown && inputValue.trim().length >= 2 && (
          <div 
            role="listbox"
            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-mood-black/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {isSearching && suggestions.length === 0 && (
              <div className="p-4 flex items-center justify-center gap-2 text-xs font-semibold text-mood-black/60">
                <Loader className="w-4 h-4 text-mood-cobalt animate-spin" />
                <span>Searching catalog & streaming previews...</span>
              </div>
            )}

            {searchError && (
              <div className="p-3 text-xs text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <span>{searchError}</span>
              </div>
            )}

            {!isSearching && suggestions.length === 0 && !searchError && (
              <div className="p-4 text-center space-y-1">
                <p className="text-xs font-bold text-mood-forest">
                  No matching tracks found for "{inputValue.trim()}"
                </p>
                <p className="text-[11px] text-mood-black/50">
                  Try searching by artist (e.g. Arijit Singh), song title, or press Enter to search full catalog.
                </p>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="py-1 divide-y divide-mood-black/5 max-h-80 overflow-y-auto">
                <div className="px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-mood-black/40 flex items-center justify-between">
                  <span>Suggestions</span>
                  <span>{suggestions.length} found</span>
                </div>

                {suggestions.map((song, index) => {
                  const songId = song._id || song.id;
                  const isSelected = selectedIndex === index;
                  const isPlayable = Boolean(song.audioUrl || song.isPlayable || song.previewUrl);

                  return (
                    <div
                      key={songId || index}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectSong(song)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors group ${
                        isSelected ? 'bg-mood-cobalt/10' : 'hover:bg-mood-black/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-mood-black/5">
                          <SongCover 
                            src={song.cover || song.albumArt} 
                            title={song.title} 
                            artist={song.artist}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 text-white ml-0.5 fill-current" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-mood-forest truncate group-hover:text-mood-cobalt transition-colors">
                            {song.title}
                          </p>
                          <p className="text-[11px] text-mood-black/60 truncate">
                            {song.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Provider Source Badge */}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
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
                        {song.isFullAudio ? (
                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300/60">
                            Full Track
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-mood-cobalt bg-mood-cobalt/10 px-1.5 py-0.5 rounded border border-mood-cobalt/20">
                            30-sec Preview
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectSong(song);
                          }}
                          className="w-7 h-7 rounded-full bg-mood-black/5 hover:bg-mood-lime hover:text-mood-forest text-mood-forest flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                          title="Play Track"
                        >
                          <Play className="w-3 h-3 ml-0.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Footer: Press Enter to view all results */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="w-full px-4 py-2.5 bg-mood-black/[0.02] hover:bg-mood-cobalt/5 text-mood-cobalt text-xs font-bold flex items-center justify-between transition-colors border-t border-mood-black/5 cursor-pointer"
                >
                  <span className="truncate">View all results for "{inputValue.trim()}"</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 ml-1.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Action Navigation Buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setCurrentView('companion')}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-full bg-mood-cobalt/10 hover:bg-mood-cobalt/15 text-mood-cobalt text-xs font-bold transition-all border border-mood-cobalt/20 shadow-xs cursor-pointer"
          title="Open AI Companion"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Companion</span>
        </button>

        <button 
          onClick={() => setCurrentView(user ? 'profile' : 'auth')}
          className={`h-9 sm:h-10 px-3 sm:px-3.5 rounded-full flex items-center gap-2 transition-colors border cursor-pointer ${
            user 
              ? 'bg-mood-forest text-white border-mood-forest hover:bg-mood-forest/90' 
              : 'bg-mood-black/5 text-mood-black/70 hover:bg-mood-black/10 border-mood-black/10'
          }`}
          title={user ? "Profile" : "Sign In"}
        >
          <User className="w-4 h-4" />
          {user && (
            <span className="text-xs font-bold hidden md:inline truncate max-w-[120px]">
              {user.name || user.email?.split('@')[0]}
            </span>
          )}
        </button>

        {user && onLogout && (
          <button
            onClick={onLogout}
            title="Log out"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-mood-black/5 hover:bg-mood-sad/15 text-mood-black/60 hover:text-mood-sad transition-colors border border-mood-black/10 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
