import React, { useState, useEffect } from 'react';
import { 
  User, LogOut, Shield, Sliders, Check, Loader, Music, 
  Heart, X, Plus, RotateCcw, Sparkles, Zap, ThumbsUp, 
  ThumbsDown, AlertCircle, Headphones, Info, Radio
} from 'lucide-react';
import * as api from '../services/api.js';

const PRESET_GENRES = [
  'Bollywood', 'Pop', 'Rock', 'Acoustic', 'Hip-Hop', 
  'EDM', 'Classical', 'Ambient', 'R&B', 'Jazz', 
  'Indie', 'Lo-Fi', 'Metal', 'Soul', 'Punk'
];

const PRESET_MOODS = [
  'Happy', 'Sad', 'Calm', 'Energetic', 'Romantic', 'Neutral'
];

const PRESET_LISTENING_MODES = [
  'Study & Focus', 'Workout & Gym', 'Chill & Relax', 
  'Sleep & Ambient', 'Travel & Commute', 'Party & Social'
];

const PRESET_LANGUAGES = ['Hindi', 'English', 'Punjabi', 'Spanish'];

const ENERGY_LEVELS = [
  { value: 'calm', label: 'Calm & Mellow', desc: 'Acoustic, ambient, lower tempo' },
  { value: 'balanced', label: 'Balanced', desc: 'Moderate tempo, everyday vibes' },
  { value: 'energetic', label: 'High Energy', desc: 'Upbeat, dance, high tempo, rock' }
];

const Profile = ({ user, setUser, setCurrentView, onLogout }) => {
  const [profileData, setProfileData] = useState(null);
  const [preferences, setPreferences] = useState({
    favoriteGenres: [],
    favoriteArtists: [],
    preferredLanguages: [],
    energyLevel: 'balanced',
    defaultMood: 'Happy',
    preferredMoods: [],
    favoriteListeningModes: []
  });

  const [customGenreInput, setCustomGenreInput] = useState('');
  const [customArtistInput, setCustomArtistInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await api.getTasteProfile();
      if (data) {
        setProfileData(data);
        const exp = data.explicit || {};
        setPreferences({
          favoriteGenres: exp.favoriteGenres || [],
          favoriteArtists: exp.favoriteArtists || [],
          preferredLanguages: exp.preferredLanguages || [],
          energyLevel: exp.energyLevel || 'balanced',
          defaultMood: exp.defaultMood || 'Happy',
          preferredMoods: exp.preferredMoods || [],
          favoriteListeningModes: exp.favoriteListeningModes || []
        });
      }
    } catch (err) {
      console.warn('Failed to load taste profile:', err.message);
      setErrorMessage(err.message || 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleToggleGenre = (genre) => {
    setPreferences(prev => {
      const exists = prev.favoriteGenres.some(g => g.toLowerCase() === genre.toLowerCase());
      const updated = exists 
        ? prev.favoriteGenres.filter(g => g.toLowerCase() !== genre.toLowerCase())
        : [...prev.favoriteGenres, genre];
      return { ...prev, favoriteGenres: updated };
    });
  };

  const handleAddCustomGenre = (e) => {
    e.preventDefault();
    const trimmed = customGenreInput.trim();
    if (!trimmed) return;
    if (!preferences.favoriteGenres.some(g => g.toLowerCase() === trimmed.toLowerCase())) {
      setPreferences(prev => ({
        ...prev,
        favoriteGenres: [...prev.favoriteGenres, trimmed]
      }));
    }
    setCustomGenreInput('');
  };

  const handleRemoveGenre = (genre) => {
    setPreferences(prev => ({
      ...prev,
      favoriteGenres: prev.favoriteGenres.filter(g => g.toLowerCase() !== genre.toLowerCase())
    }));
  };

  const handleAddArtist = (e) => {
    e.preventDefault();
    const trimmed = customArtistInput.trim();
    if (!trimmed) return;
    if (!preferences.favoriteArtists.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      setPreferences(prev => ({
        ...prev,
        favoriteArtists: [...prev.favoriteArtists, trimmed]
      }));
    }
    setCustomArtistInput('');
  };

  const handleRemoveArtist = (artist) => {
    setPreferences(prev => ({
      ...prev,
      favoriteArtists: prev.favoriteArtists.filter(a => a.toLowerCase() !== artist.toLowerCase())
    }));
  };

  const handleToggleMood = (mood) => {
    setPreferences(prev => {
      const exists = prev.preferredMoods.some(m => m.toLowerCase() === mood.toLowerCase());
      const updated = exists
        ? prev.preferredMoods.filter(m => m.toLowerCase() !== mood.toLowerCase())
        : [...prev.preferredMoods, mood];
      return { ...prev, preferredMoods: updated };
    });
  };

  const handleToggleListeningMode = (mode) => {
    setPreferences(prev => {
      const exists = prev.favoriteListeningModes.some(m => m.toLowerCase() === mode.toLowerCase());
      const updated = exists
        ? prev.favoriteListeningModes.filter(m => m.toLowerCase() !== mode.toLowerCase())
        : [...prev.favoriteListeningModes, mode];
      return { ...prev, favoriteListeningModes: updated };
    });
  };

  const handleToggleLanguage = (lang) => {
    setPreferences(prev => {
      const exists = prev.preferredLanguages.includes(lang);
      const updated = exists 
        ? prev.preferredLanguages.filter(l => l !== lang)
        : [...prev.preferredLanguages, lang];
      return { ...prev, preferredLanguages: updated };
    });
  };

  const handleSavePreferences = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);
    try {
      const res = await api.updateTasteProfile(preferences);
      setSavedSuccess(true);
      if (res && res.preferences) {
        setPreferences(prev => ({ ...prev, ...res.preferences }));
      }
      setTimeout(() => setSavedSuccess(false), 3500);
      // Refresh profile data to reflect updated explicit values
      await fetchProfile();
    } catch (err) {
      console.warn('Failed to save taste profile:', err.message);
      setErrorMessage(err.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleResetInferred = async () => {
    setResetting(true);
    setShowResetConfirm(false);
    setResetSuccess(false);
    setErrorMessage(null);
    try {
      await api.resetInferredTaste();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3500);
      await fetchProfile();
    } catch (err) {
      console.warn('Failed to reset inferred taste:', err.message);
      setErrorMessage(err.message || 'Failed to reset inferred signals');
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('userInfo');
      setUser(null);
      setCurrentView('discover');
    }
  };

  if (!user) return null;

  const isNewUser = profileData?.isNewUser || (preferences.favoriteGenres.length === 0 && preferences.favoriteArtists.length === 0);
  const inferred = profileData?.inferred || {};
  const activityCounts = inferred.activityCounts || { likesCount: 0, dislikesCount: 0, skipsCount: 0, favoritesCount: 0, historyCount: 0 };
  const frequentlyLiked = inferred.frequentlyLikedTracks || [];
  const frequentlySkipped = inferred.frequentlySkippedTracks || [];
  const topInferredGenres = inferred.topGenres || [];
  const topInferredArtists = inferred.topArtists || [];
  const topInferredMoods = inferred.topMoods || [];

  return (
    <div className="pb-36 py-8 px-4 sm:px-8 max-w-5xl mx-auto space-y-8 animate-in fade-in">
      {/* Header Profile Summary */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-mood-black/5 shadow-md flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          <div className="w-20 h-20 bg-mood-cobalt/10 rounded-2xl flex items-center justify-center text-mood-cobalt border border-mood-cobalt/20 shadow-inner shrink-0">
            <User className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-2xl font-black text-mood-forest">{user.name}</h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-mood-cobalt/10 text-mood-cobalt border border-mood-cobalt/20">
                Personal Music Taste Profile
              </span>
            </div>
            <p className="text-sm text-mood-black/60">{user.email}</p>
            {profileData?.explicit?.updatedAt && (
              <p className="text-xs text-mood-black/40">
                Taste profile updated on {new Date(profileData.explicit.updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <button 
          onClick={handleSignOut}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-mood-sad/10 text-mood-sad font-bold hover:bg-mood-sad/20 transition-colors border border-mood-sad/20 text-xs shrink-0 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {/* Security & Isolation Callout */}
      <div className="bg-mood-forest/5 p-4 rounded-2xl border border-mood-forest/10 flex items-start gap-3">
        <Shield className="w-5 h-5 text-mood-forest shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm">
          <p className="font-bold text-mood-forest mb-0.5">Secure Cloud Account Isolation</p>
          <p className="text-mood-black/70 leading-relaxed">
            Your taste profile, explicit preferences, liked tracks, skips, and feedback are strictly isolated to your authenticated account. Recommendations and the AI Companion query your real signals without sharing them across accounts.
          </p>
        </div>
      </div>

      {/* Onboarding State for New Users */}
      {isNewUser && (
        <div className="bg-gradient-to-r from-mood-cobalt/10 via-mood-forest/5 to-mood-lime/10 p-6 rounded-3xl border border-mood-cobalt/20 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-mood-cobalt" />
            <h3 className="font-bold text-base text-mood-forest">Welcome! Set Up Your Music Taste</h3>
          </div>
          <p className="text-xs sm:text-sm text-mood-black/70">
            You don't have any saved preferences yet. Choose your favorite genres, preferred artists, and listening vibe below to help Moodify recommend music you'll love.
          </p>
        </div>
      )}

      {/* Status Notifications */}
      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Taste profile saved! Future recommendations will reflect your updated taste.</span>
        </div>
      )}

      {resetSuccess && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <Check className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Inferred negative signals (skips & dislikes) have been reset. Your playlists and favorites were preserved!</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Explicit Preferences vs Inferred Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN (2 Cols): Explicit Music Taste Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-mood-black/5 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-mood-black/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-mood-cobalt" />
                <h3 className="text-lg font-black text-mood-forest">Explicit Music Taste</h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-mood-black/5 text-mood-black/60">
                User-Configured
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-mood-black/40">
                <Loader className="w-5 h-5 animate-spin text-mood-cobalt" />
                <span>Loading your taste profile...</span>
              </div>
            ) : (
              <form onSubmit={handleSavePreferences} className="space-y-6">
                
                {/* 1. My Favorite Genres */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-mood-forest uppercase tracking-wider">
                      1. My Favorite Genres ({preferences.favoriteGenres.length} selected)
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_GENRES.map(g => {
                      const selected = preferences.favoriteGenres.some(item => item.toLowerCase() === g.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={g}
                          onClick={() => handleToggleGenre(g)}
                          className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-all cursor-pointer ${
                            selected
                              ? 'bg-mood-cobalt text-white border-mood-cobalt shadow-xs'
                              : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 inline mr-1" />}
                          {g}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Genre Input */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add custom genre (e.g. Synthwave, Ghazal)..."
                      value={customGenreInput}
                      onChange={(e) => setCustomGenreInput(e.target.value)}
                      className="flex-1 px-3.5 py-1.5 text-xs bg-mood-black/5 border border-mood-black/10 rounded-xl focus:outline-none focus:border-mood-cobalt"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomGenre}
                      disabled={!customGenreInput.trim()}
                      className="px-3.5 py-1.5 bg-mood-forest text-white rounded-xl text-xs font-bold hover:bg-mood-forest/90 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>

                  {/* Active Genres Tags */}
                  {preferences.favoriteGenres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {preferences.favoriteGenres.map(g => (
                        <span key={g} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-mood-cobalt/10 text-mood-cobalt font-bold border border-mood-cobalt/20">
                          {g}
                          <button 
                            type="button" 
                            onClick={() => handleRemoveGenre(g)} 
                            className="hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. My Preferred Artists */}
                <div className="space-y-3 border-t border-mood-black/5 pt-5">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                    2. My Preferred Artists ({preferences.favoriteArtists.length} added)
                  </label>
                  <p className="text-xs text-mood-black/60">
                    Tell us artists you love (e.g., Arijit Singh, Coldplay, Taylor Swift, Diljit Dosanjh).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add an artist name..."
                      value={customArtistInput}
                      onChange={(e) => setCustomArtistInput(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-xs bg-mood-black/5 border border-mood-black/10 rounded-xl focus:outline-none focus:border-mood-cobalt"
                    />
                    <button
                      type="button"
                      onClick={handleAddArtist}
                      disabled={!customArtistInput.trim()}
                      className="px-4 py-2 bg-mood-forest text-white rounded-xl text-xs font-bold hover:bg-mood-forest/90 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Artist
                    </button>
                  </div>

                  {preferences.favoriteArtists.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {preferences.favoriteArtists.map(a => (
                        <span key={a} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs bg-mood-forest text-white font-bold shadow-xs">
                          <Music className="w-3 h-3 text-mood-lime" />
                          {a}
                          <button 
                            type="button" 
                            onClick={() => handleRemoveArtist(a)} 
                            className="hover:text-red-300 ml-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-mood-black/5 rounded-xl text-xs text-mood-black/50 text-center">
                      No favorite artists added yet. Add artists above to receive personalized artist-inspired recommendations!
                    </div>
                  )}
                </div>

                {/* 3. My Music Energy Preference */}
                <div className="space-y-3 border-t border-mood-black/5 pt-5">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                    3. My Music Energy Preference
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {ENERGY_LEVELS.map(item => {
                      const isSelected = preferences.energyLevel === item.value;
                      return (
                        <button
                          type="button"
                          key={item.value}
                          onClick={() => setPreferences(prev => ({ ...prev, energyLevel: item.value }))}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-mood-cobalt/10 text-mood-cobalt border-mood-cobalt shadow-xs font-bold ring-1 ring-mood-cobalt'
                              : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black">{item.label}</span>
                            {isSelected && <Zap className="w-3.5 h-3.5 text-mood-cobalt" />}
                          </div>
                          <p className="text-[11px] text-mood-black/60 font-normal">{item.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. My Favorite Moods */}
                <div className="space-y-3 border-t border-mood-black/5 pt-5">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                    4. My Favorite Moods ({preferences.preferredMoods.length} selected)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_MOODS.map(m => {
                      const selected = preferences.preferredMoods.some(item => item.toLowerCase() === m.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => handleToggleMood(m)}
                          className={`text-xs px-3.5 py-1.5 rounded-full font-semibold border transition-all cursor-pointer ${
                            selected
                              ? 'bg-mood-lime text-mood-forest border-mood-lime shadow-xs font-bold'
                              : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 inline mr-1 text-mood-forest" />}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. My Listening Modes */}
                <div className="space-y-3 border-t border-mood-black/5 pt-5">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                    5. My Favorite Listening Modes ({preferences.favoriteListeningModes.length} selected)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_LISTENING_MODES.map(mode => {
                      const selected = preferences.favoriteListeningModes.some(item => item.toLowerCase() === mode.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={mode}
                          onClick={() => handleToggleListeningMode(mode)}
                          className={`text-xs px-3.5 py-1.5 rounded-full font-semibold border transition-all cursor-pointer ${
                            selected
                              ? 'bg-mood-forest text-white border-mood-forest shadow-xs font-bold'
                              : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 inline mr-1" />}
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preferred Languages */}
                <div className="space-y-3 border-t border-mood-black/5 pt-5">
                  <label className="text-xs font-bold text-mood-forest uppercase tracking-wider block">
                    Preferred Languages
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_LANGUAGES.map(lang => {
                      const selected = preferences.preferredLanguages.includes(lang);
                      return (
                        <button
                          type="button"
                          key={lang}
                          onClick={() => handleToggleLanguage(lang)}
                          className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-all cursor-pointer ${
                            selected
                              ? 'bg-mood-cobalt text-white border-mood-cobalt shadow-xs'
                              : 'bg-mood-black/5 text-mood-black/70 border-transparent hover:bg-mood-black/10'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 inline mr-1" />}
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save Explicit Preferences Action */}
                <div className="pt-4 border-t border-mood-black/10 flex items-center justify-between">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 bg-mood-cobalt text-white rounded-2xl text-xs font-bold hover:bg-mood-cobalt/90 transition-all flex items-center gap-2 shadow-md shadow-mood-cobalt/20 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save My Music Taste
                  </button>
                  {savedSuccess && (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Preferences updated!
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (1 Col): Inferred Preferences & Activity Signals */}
        <div className="space-y-6">
          
          {/* Real Activity Signals Summary */}
          <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-md space-y-4">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-mood-cobalt" />
              <h4 className="text-sm font-black text-mood-forest uppercase tracking-wider">
                Real Preference Signals
              </h4>
            </div>
            <p className="text-xs text-mood-black/60 leading-relaxed">
              Derived strictly from your genuine interactions. No fabricated listening history or fake statistics.
            </p>

            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="bg-mood-black/5 p-3 rounded-2xl">
                <div className="flex items-center justify-center gap-1 text-mood-cobalt font-black text-lg">
                  <ThumbsUp className="w-4 h-4" />
                  {activityCounts.likesCount}
                </div>
                <p className="text-[10px] font-bold text-mood-black/60 uppercase tracking-wider">Likes</p>
              </div>

              <div className="bg-mood-black/5 p-3 rounded-2xl">
                <div className="flex items-center justify-center gap-1 text-mood-sad font-black text-lg">
                  <Heart className="w-4 h-4" />
                  {activityCounts.favoritesCount}
                </div>
                <p className="text-[10px] font-bold text-mood-black/60 uppercase tracking-wider">Favorites</p>
              </div>

              <div className="bg-mood-black/5 p-3 rounded-2xl">
                <div className="flex items-center justify-center gap-1 text-amber-600 font-black text-lg">
                  <Headphones className="w-4 h-4" />
                  {activityCounts.historyCount}
                </div>
                <p className="text-[10px] font-bold text-mood-black/60 uppercase tracking-wider">Plays</p>
              </div>

              <div className="bg-mood-black/5 p-3 rounded-2xl">
                <div className="flex items-center justify-center gap-1 text-mood-black/70 font-black text-lg">
                  <RotateCcw className="w-4 h-4" />
                  {activityCounts.skipsCount}
                </div>
                <p className="text-[10px] font-bold text-mood-black/60 uppercase tracking-wider">Skips</p>
              </div>
            </div>
          </div>

          {/* Inferred Top Genres */}
          <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-md space-y-3">
            <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">
              Top Inferred Genres
            </h4>
            {topInferredGenres.length > 0 ? (
              <div className="space-y-1.5">
                {topInferredGenres.map(item => (
                  <div key={item.genre} className="flex items-center justify-between p-2 rounded-xl bg-mood-black/5 text-xs">
                    <span className="font-bold text-mood-forest">{item.genre}</span>
                    <span className="text-[11px] font-bold text-mood-cobalt px-2 py-0.5 rounded-full bg-mood-cobalt/10">
                      {item.count} signal{item.count > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-mood-black/50 p-3 bg-mood-black/5 rounded-xl text-center">
                No inferred genre signals yet. Like or favorite tracks to generate inferred taste!
              </p>
            )}
          </div>

          {/* Inferred Top Artists */}
          <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-md space-y-3">
            <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">
              Top Inferred Artists
            </h4>
            {topInferredArtists.length > 0 ? (
              <div className="space-y-1.5">
                {topInferredArtists.map(item => (
                  <div key={item.artist} className="flex items-center justify-between p-2 rounded-xl bg-mood-black/5 text-xs">
                    <span className="font-bold text-mood-forest truncate max-w-[150px]">{item.artist}</span>
                    <span className="text-[11px] font-bold text-mood-forest px-2 py-0.5 rounded-full bg-mood-lime/30">
                      {item.count} signal{item.count > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-mood-black/50 p-3 bg-mood-black/5 rounded-xl text-center">
                No inferred artist signals yet. Play and favorite artists to populate this list.
              </p>
            )}
          </div>

          {/* Inferred Top Moods */}
          <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-md space-y-3">
            <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">
              Top Inferred Moods
            </h4>
            {topInferredMoods.length > 0 ? (
              <div className="space-y-1.5">
                {topInferredMoods.map(item => (
                  <div key={item.mood} className="flex items-center justify-between p-2 rounded-xl bg-mood-black/5 text-xs">
                    <span className="font-bold text-mood-forest">{item.mood}</span>
                    <span className="text-[11px] font-bold text-mood-forest px-2 py-0.5 rounded-full bg-mood-lime/20">
                      {item.count} reaction{item.count > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-mood-black/50 p-3 bg-mood-black/5 rounded-xl text-center">
                No mood feedback signals recorded yet.
              </p>
            )}
          </div>

          {/* Reset Inferred Negative Signals */}
          <div className="bg-white rounded-3xl p-6 border border-mood-black/5 shadow-md space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">
                Reset Negative Signals
              </h4>
            </div>
            <p className="text-xs text-mood-black/60 leading-relaxed">
              Changed your taste? Clear your recorded skips and dislikes to give the recommendation engine a fresh baseline without losing your saved favorites or playlists.
            </p>

            {showResetConfirm ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs">
                <p className="font-bold text-amber-900">Confirm Reset?</p>
                <p className="text-amber-800 text-[11px]">
                  This clears your skip and dislike penalties. Your favorites and explicit genres remain intact.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleResetInferred}
                    disabled={resetting}
                    className="flex-1 py-1.5 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    {resetting ? 'Resetting...' : 'Yes, Reset'}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-3 py-1.5 bg-mood-black/10 text-mood-black/70 rounded-xl font-bold text-xs hover:bg-mood-black/20 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Inferred Negative Signals
              </button>
            )}
          </div>

        </div>
      </div>

      {/* TRACKS I LIKE & TRACKS I FREQUENTLY SKIP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
        
        {/* Frequently Liked Tracks */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-mood-black/5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-mood-black/10 pb-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-bold text-mood-forest uppercase tracking-wider">
                Tracks I Like ({frequentlyLiked.length})
              </h4>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-50">
              Positive Feedback
            </span>
          </div>

          {frequentlyLiked.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {frequentlyLiked.map((t, idx) => (
                <div key={t.id || idx} className="flex items-center gap-3 p-2.5 rounded-2xl bg-mood-black/5 hover:bg-mood-black/10 transition-colors">
                  {t.cover ? (
                    <img src={t.cover} alt={t.title} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-mood-cobalt/10 flex items-center justify-center text-mood-cobalt shrink-0">
                      <Music className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-mood-forest truncate">{t.title}</p>
                    <p className="text-[11px] text-mood-black/60 truncate">{t.artist}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                    Liked
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center bg-mood-black/5 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-mood-forest">No Liked Tracks Yet</p>
              <p className="text-[11px] text-mood-black/50">
                Tap the thumbs-up button while listening to reinforce your favorite tracks.
              </p>
            </div>
          )}
        </div>

        {/* Frequently Skipped Tracks */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-mood-black/5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-mood-black/10 pb-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <h4 className="text-sm font-bold text-mood-forest uppercase tracking-wider">
                Tracks I Frequently Skip ({frequentlySkipped.length})
              </h4>
            </div>
            <span className="text-[11px] font-bold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50">
              Downranked
            </span>
          </div>

          {frequentlySkipped.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {frequentlySkipped.map((t, idx) => (
                <div key={t.id || idx} className="flex items-center justify-between p-2.5 rounded-2xl bg-mood-black/5">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-xs font-bold text-mood-forest truncate">{t.title}</p>
                    <p className="text-[11px] text-mood-black/60 truncate">{t.artist}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                    {t.skipCount} skip{t.skipCount > 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center bg-mood-black/5 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-mood-forest">No Frequently Skipped Tracks</p>
              <p className="text-[11px] text-mood-black/50">
                Tracks you skip multiple times are softly deprioritized in future recommendations.
              </p>
            </div>
          )}
        </div>

        {/* Feature 7: Privacy & Data Controls Shortcut Card */}
        <div className="bg-mood-forest text-mood-offwhite rounded-3xl p-6 sm:p-8 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-mood-lime" />
              <h4 className="text-base font-black tracking-tight">Privacy, Camera & Data Controls</h4>
            </div>
            <p className="text-xs text-mood-offwhite/80 max-w-xl font-medium">
              Manage in-memory camera privacy, verify zero persistent biometric storage, clear listening and mood logs, or reset inferred taste signals.
            </p>
          </div>
          <button
            onClick={() => setCurrentView && setCurrentView('privacy')}
            className="flex items-center gap-2 bg-mood-lime text-mood-forest px-5 py-2.5 rounded-2xl text-xs font-black hover:bg-mood-lime/90 transition-all shrink-0 shadow-xs"
          >
            <Shield className="w-4 h-4" />
            Manage Privacy & Data
          </button>
        </div>

      </div>

    </div>
  );
};

export default Profile;
