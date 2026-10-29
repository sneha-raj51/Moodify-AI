import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Player from './components/Player';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import Discover from './pages/Discover';
import MoodStudio from './pages/MoodStudio';
import MoodMix from './pages/MoodMix';
import MoodTransition from './pages/MoodTransition';
import MoodAnalytics from './pages/MoodAnalytics';
import Favorites from './pages/Favorites';
import Playlists from './pages/Playlists';
import SmartPlaylistBuilder from './pages/SmartPlaylistBuilder';
import History from './pages/History';
import CompanionChat from './pages/CompanionChat';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import PrivacySettings from './pages/PrivacySettings';
import * as api from './services/api';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('userInfo');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [currentView, setCurrentView] = useState('discover');
  const [autoStartCamera, setAutoStartCamera] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState([]);
  const [globalMood, setGlobalMood] = useState('All');
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState(null);
  const [lastFinishedSong, setLastFinishedSong] = useState(null);
  
  const [songs, setSongs] = useState([]);
  const [dbFavorites, setDbFavorites] = useState([]);
  const [favoriteError, setFavoriteError] = useState(null);
  const [jamendoStatus, setJamendoStatus] = useState('missing');

  const [favorites, setFavorites] = useState(new Set());
  const [moodHistory, setMoodHistory] = useState([]);
  const [listeningHistory, setListeningHistory] = useState([]);

  // Fetch songs and user-specific persistent data from MongoDB
  useEffect(() => {
    if (!user) {
      // Clear all state when logged out
      setFavorites(new Set());
      setDbFavorites([]);
      setMoodHistory([]);
      setListeningHistory([]);
      return;
    }

    const fetchUserData = async () => {
      try {
        const fetchedSongs = await api.getSongs();
        setSongs(fetchedSongs);

        // Fetch user's isolated data from MongoDB
        const [fetchedFavs, fetchedMoods, fetchedHistory, config] = await Promise.all([
          api.getFavorites(),
          api.getMoods(),
          api.getHistory(),
          api.getJamendoConfig()
        ]);

        setDbFavorites(fetchedFavs || []);
        const favIds = new Set();
        const registerId = (val) => {
          if (!val) return;
          const s = String(val).trim();
          favIds.add(s);
          if (s.startsWith('itunes_')) {
            favIds.add(s.replace(/^itunes_/, ''));
          } else if (/^\d+$/.test(s)) {
            favIds.add(`itunes_${s}`);
          }
        };

        (fetchedFavs || []).forEach(f => {
          if (f.rawSongId) registerId(f.rawSongId);
          if (typeof f.songId === 'string') {
            registerId(f.songId);
          } else if (f.songId && typeof f.songId === 'object') {
            if (f.songId._id) registerId(f.songId._id);
            if (f.songId.id) registerId(f.songId.id);
            if (f.songId.songId) registerId(f.songId.songId);
          }
        });
        setFavorites(favIds);

        setMoodHistory(fetchedMoods || []);

        if (Array.isArray(fetchedHistory)) {
          setListeningHistory(fetchedHistory);
        }

        setJamendoStatus(config?.status || 'missing');
      } catch (err) {
        console.warn('Error loading user data:', err.message);
      }
    };

    fetchUserData();
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    localStorage.removeItem('moodify_favorites');
    localStorage.removeItem('moodify_mood_history');
    localStorage.removeItem('moodify_listening_history');
    setUser(null);
    setCurrentSong(null);
    setFavorites(new Set());
    setDbFavorites([]);
    setMoodHistory([]);
    setListeningHistory([]);
    setCurrentView('discover');
  };

  const handleSetGlobalMood = async (mood) => {
    setGlobalMood(mood);
    if (mood !== 'All' && user) {
      const newEntry = { mood, timestamp: new Date().toISOString() };
      setMoodHistory(prev => [newEntry, ...prev]);
      try {
        await api.addMood(mood, 'manual');
      } catch (e) {
        console.warn('Failed to record mood to server:', e.message);
      }
    }
  };

  const toggleFavorite = async (songOrId, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!user) return;
    
    const isObject = typeof songOrId === 'object' && songOrId !== null;
    const rawId = isObject ? (songOrId._id || songOrId.id || songOrId.songId) : songOrId;
    if (!rawId) return;

    const idStr = String(rawId).trim();
    const idVariants = [idStr];
    if (idStr.startsWith('itunes_')) {
      idVariants.push(idStr.replace(/^itunes_/, ''));
    } else if (/^\d+$/.test(idStr)) {
      idVariants.push(`itunes_${idStr}`);
    }

    const isFav = idVariants.some(v => favorites.has(v)) ||
      (isObject && [songOrId._id, songOrId.id, songOrId.songId].some(x => x && (favorites.has(x) || favorites.has(String(x)))));
    
    // Save previous state for rollback if request fails
    const previousFavs = new Set(favorites);
    const previousDbFavs = [...dbFavorites];

    // Optimistic UI update
    const newFavs = new Set(favorites);
    if (isFav) {
      idVariants.forEach(v => newFavs.delete(v));
      if (isObject) {
        if (songOrId._id) { newFavs.delete(songOrId._id); newFavs.delete(String(songOrId._id)); }
        if (songOrId.id) { newFavs.delete(songOrId.id); newFavs.delete(String(songOrId.id)); }
        if (songOrId.songId) { newFavs.delete(songOrId.songId); newFavs.delete(String(songOrId.songId)); }
      }
    } else {
      idVariants.forEach(v => newFavs.add(v));
      if (isObject) {
        if (songOrId._id) newFavs.add(String(songOrId._id));
        if (songOrId.id) newFavs.add(String(songOrId.id));
      }
    }
    setFavorites(newFavs);

    try {
      if (isFav) {
        // Find existing record in dbFavorites with normalized ID check
        const matchVariant = (candidate) => {
          if (!candidate) return false;
          const cStr = String(candidate).trim();
          return idVariants.includes(cStr) || idVariants.some(v => v.replace(/^itunes_/, '') === cStr.replace(/^itunes_/, ''));
        };

        const favRecord = dbFavorites.find(f => {
          if (matchVariant(f.rawSongId)) return true;
          if (matchVariant(f._id)) return true;
          const s = f.songId;
          if (!s) return false;
          if (typeof s === 'string') return matchVariant(s);
          return matchVariant(s._id) || matchVariant(s.id) || matchVariant(s.songId);
        });

        const targetId = favRecord?._id || idStr;
        await api.removeFavorite(targetId);
        setDbFavorites(prev => prev.filter(f => 
          f._id !== targetId && 
          !matchVariant(f.rawSongId) && 
          !matchVariant(f.songId) && 
          (!f.songId || (!matchVariant(f.songId._id) && !matchVariant(f.songId.id)))
        ));
      } else {
        const externalData = isObject ? songOrId : null;
        const newFav = await api.addFavorite(idStr, externalData);
        if (newFav) {
          const resolvedSong = isObject
            ? songOrId
            : (songs.find(s => String(s._id || s.id) === idStr) || newFav.songId || { _id: idStr, id: idStr });

          const normalizedFav = {
            ...newFav,
            rawSongId: idStr,
            songId: resolvedSong
          };
          setDbFavorites(prev => {
            const filtered = prev.filter(f => String(f.rawSongId) !== idStr && f._id !== newFav._id);
            return [...filtered, normalizedFav];
          });
        }
      }
    } catch (err) {
      console.error('Favorite action failed:', err);
      // Revert optimistic UI on error
      setFavorites(previousFavs);
      setDbFavorites(previousDbFavs);
      setFavoriteError(err.message || 'Unable to update favorites. Please try again.');
      setTimeout(() => setFavoriteError(null), 4000);
    }
  };

  const handleSetCurrentView = (view, autoStart = false) => {
    setCurrentView(view);
    setAutoStartCamera(autoStart);
  };

  const handleAddToQueue = (song) => {
    setQueue(prev => [...prev, song]);
  };

  const handlePlayNext = (song) => {
    if (!currentSong) {
      setCurrentSong(song);
      return;
    }
    const currentId = currentSong._id || currentSong.id;
    const idx = queue.findIndex(s => (s._id || s.id) === currentId);
    if (idx === -1) {
      setQueue([currentSong, song, ...queue]);
    } else {
      const copy = [...queue];
      copy.splice(idx + 1, 0, song);
      setQueue(copy);
    }
  };

  // FEATURE 1: MANDATORY AUTHENTICATION
  // If no authenticated session exists, display Login/Sign Up exclusively.
  if (!user) {
    return (
      <div className="min-h-screen w-full bg-mood-offwhite text-mood-black font-sans flex flex-col justify-center items-center p-4 selection:bg-mood-lime selection:text-mood-forest">
        <Auth 
          setUser={setUser} 
          setCurrentView={handleSetCurrentView} 
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-mood-offwhite text-mood-black font-sans flex overflow-hidden selection:bg-mood-lime selection:text-mood-forest">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={handleSetCurrentView} 
        jamendoStatus={jamendoStatus} 
      />
      
      <div className="flex-1 flex flex-col h-full relative">
        <Header 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          setCurrentSong={setCurrentSong}
          setQueue={setQueue}
          user={user} 
          setCurrentView={handleSetCurrentView} 
          onLogout={handleLogout}
        />
        
        {/* Main Content Area */}
        <main className={`flex-1 relative ${currentView === 'companion' ? 'overflow-hidden flex flex-col min-h-0 pb-0' : 'overflow-y-auto pb-28'}`}>
          {favoriteError && (
            <div className="fixed top-20 right-6 z-50 bg-red-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in fade-in slide-in-from-top-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{favoriteError}</span>
            </div>
          )}
          {currentView === 'discover' && (
            <Discover 
              songs={songs}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setCurrentSong={setCurrentSong} 
              setQueue={setQueue}
              currentSong={currentSong}
              globalMood={globalMood}
              setGlobalMood={handleSetGlobalMood}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              setCurrentView={handleSetCurrentView}
              listeningHistory={listeningHistory}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              onAddToQueue={handleAddToQueue}
              onPlayNext={handlePlayNext}
            />
          )}

          {currentView === 'companion' && (
            <CompanionChat 
              user={user}
              currentSong={currentSong}
              setCurrentSong={setCurrentSong}
              queue={queue}
              setQueue={setQueue}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              lastFinishedSong={lastFinishedSong}
            />
          )}

          {currentView === 'mood-studio' && (
            <MoodStudio 
              globalMood={globalMood}
              setGlobalMood={handleSetGlobalMood}
              autoStartCamera={autoStartCamera}
              setCurrentView={handleSetCurrentView}
              songs={songs}
              favorites={favorites}
              setCurrentSong={setCurrentSong} 
              setQueue={setQueue}
              currentSong={currentSong}
              toggleFavorite={toggleFavorite}
              listeningHistory={listeningHistory}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
            />
          )}

          {currentView === 'mood-mix' && (
            <MoodMix 
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              setCurrentView={handleSetCurrentView}
              user={user}
            />
          )}

          {currentView === 'mood-transition' && (
            <MoodTransition 
              songs={songs}
              globalMood={globalMood}
              currentSong={currentSong}
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
            />
          )}

          {currentView === 'smart-builder' && (
            <SmartPlaylistBuilder 
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              currentSong={currentSong}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              setCurrentView={handleSetCurrentView}
              user={user}
            />
          )}

          {currentView === 'playlists' && (
            <Playlists 
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              setCurrentView={handleSetCurrentView}
              user={user}
            />
          )}

          {currentView === 'favorites' && (
            <Favorites 
              songs={songs}
              dbFavorites={dbFavorites}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              setCurrentView={handleSetCurrentView}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              user={user}
            />
          )}

          {currentView === 'history' && (
            <History 
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
              setCurrentView={handleSetCurrentView}
              user={user}
            />
          )}

          {currentView === 'mood-insights' && (
            <MoodAnalytics 
              songs={songs}
              favorites={favorites}
              moodHistory={moodHistory}
              listeningHistory={listeningHistory}
              setCurrentSong={setCurrentSong}
              setQueue={setQueue}
            />
          )}

          {currentView === 'profile' && (
            <Profile 
              user={user}
              setUser={setUser}
              setCurrentView={handleSetCurrentView}
              onLogout={handleLogout}
            />
          )}

          {currentView === 'privacy' && (
            <PrivacySettings 
              user={user}
              setCurrentView={handleSetCurrentView}
            />
          )}
        </main>
      </div>

      {/* Persistent & Expanded Player */}
      <Player 
        currentSong={currentSong} 
        playlist={songs}
        queue={queue}
        setQueue={setQueue}
        setCurrentSong={setCurrentSong}
        favorites={favorites}
        toggleFavorite={toggleFavorite}
        onOpenAddToPlaylist={(song) => setSongToAddToPlaylist(song)}
        onClose={() => setCurrentSong(null)} 
        onSongFinished={(song) => setLastFinishedSong(song)}
      />

      {/* Add To Playlist Modal */}
      <AddToPlaylistModal 
        song={songToAddToPlaylist}
        isOpen={Boolean(songToAddToPlaylist)}
        onClose={() => setSongToAddToPlaylist(null)}
      />
    </div>
  );
}

export default App;
