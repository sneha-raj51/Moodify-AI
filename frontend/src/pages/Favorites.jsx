import React, { useState, useMemo } from 'react';
import { 
  Heart, Play, Shuffle, Plus, Music, Search, 
  Sparkles, ListPlus, AlertCircle 
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const Favorites = ({ 
  songs = [], 
  dbFavorites = [],
  favorites = new Set(), 
  toggleFavorite, 
  setCurrentSong, 
  setQueue, 
  setCurrentView, 
  onOpenAddToPlaylist,
  user
}) => {
  const [search, setSearch] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [createdNotice, setCreatedNotice] = useState(null);

  // Extract songs that are favorited from dbFavorites (including iTunes & AI recs) and songs catalog
  const favoriteSongs = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    const registerKey = (id) => {
      if (!id) return;
      const s = String(id).trim();
      seenIds.add(s);
      if (s.startsWith('itunes_')) seenIds.add(s.slice(7));
      if (/^\d+$/.test(s)) seenIds.add(`itunes_${s}`);
    };

    // 1. Process all dbFavorites entries (which hold full song objects for catalog, iTunes, and AI songs)
    if (Array.isArray(dbFavorites) && dbFavorites.length > 0) {
      for (const fav of dbFavorites) {
        const songData = fav.songId;
        if (!songData) continue;
        
        let songObj = null;
        if (typeof songData === 'object') {
          songObj = { ...songData };
        } else {
          const matched = songs.find(s => {
            const sid = String(s._id || s.id || '');
            const target = String(songData);
            return sid === target || 
              (target.startsWith('itunes_') && sid === target.slice(7)) || 
              (sid.startsWith('itunes_') && sid.slice(7) === target);
          });
          songObj = matched ? { ...matched } : { _id: songData, id: songData, title: 'Saved Track', artist: 'Unknown Artist' };
        }

        const primaryId = songObj._id || songObj.id || fav.rawSongId || fav.songId;
        const key = String(primaryId);
        if (key && !seenIds.has(key)) {
          registerKey(primaryId);
          if (fav.rawSongId) registerKey(fav.rawSongId);
          if (typeof fav.songId === 'string') registerKey(fav.songId);
          list.push({
            ...songObj,
            favoriteRecordId: fav._id
          });
        }
      }
    }

    // 2. Also check any catalog songs that match the favorites Set (handles optimistic/instant state)
    for (const s of songs) {
      const sId = s._id || s.id || s.songId;
      if (!sId) continue;
      const strId = String(sId);
      const isFav = favorites.has(sId) || favorites.has(strId) || 
        (strId.startsWith('itunes_') && favorites.has(strId.slice(7))) || 
        (/^\d+$/.test(strId) && favorites.has(`itunes_${strId}`));
      if (isFav && !seenIds.has(strId)) {
        registerKey(strId);
        list.push(s);
      }
    }

    return list;
  }, [songs, dbFavorites, favorites]);

  // Filter by local search
  const filteredFavorites = useMemo(() => {
    if (!search.trim()) return favoriteSongs;
    const q = search.toLowerCase();
    return favoriteSongs.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.artist.toLowerCase().includes(q) ||
      (s.genre && s.genre.toLowerCase().includes(q))
    );
  }, [favoriteSongs, search]);

  const handlePlayAll = (shuffle = false) => {
    if (favoriteSongs.length === 0) return;
    let list = [...favoriteSongs];
    if (shuffle) {
      list.sort(() => Math.random() - 0.5);
    }
    if (setQueue) setQueue(list);
    setCurrentSong(list[0]);
  };

  const handleSaveAsPlaylist = async () => {
    if (favoriteSongs.length === 0) return;
    setCreatingPlaylist(true);
    try {
      await api.createPlaylist({
        name: `Favorites Mix (${new Date().toLocaleDateString()})`,
        description: 'Auto-generated from your favorite tracks',
        songs: favoriteSongs
      });
      setCreatedNotice('Playlist created successfully from your favorites!');
      setTimeout(() => setCreatedNotice(null), 3000);
    } catch (e) {
      console.warn('Failed to save playlist:', e);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  return (
    <div className="pb-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-8">
        
        {/* Header Hero Banner */}
        <div className="bg-gradient-to-r from-mood-forest via-[#1e3d23] to-[#122817] rounded-3xl p-8 md:p-10 text-mood-offwhite shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-80 h-80 bg-mood-lime/15 rounded-full blur-3xl -mr-20 -mt-20"></div>
          
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-mood-mustard/20 border border-mood-mustard/30 flex items-center justify-center shrink-0 shadow-inner">
              <Heart className="w-12 h-12 text-mood-mustard fill-mood-mustard" />
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-extrabold tracking-widest text-mood-lime">Library</span>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">My Favorites</h1>
              <p className="text-mood-offwhite/70 text-sm">
                {favoriteSongs.length} {favoriteSongs.length === 1 ? 'saved track' : 'saved tracks'}
                {!user && ' • Saved locally on this browser'}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handlePlayAll(false)}
              disabled={favoriteSongs.length === 0}
              className="px-6 py-3 rounded-full bg-mood-lime text-mood-forest font-bold text-sm hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" /> Play All
            </button>

            <button
              onClick={() => handlePlayAll(true)}
              disabled={favoriteSongs.length === 0}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-4 h-4" /> Shuffle
            </button>

            <button
              onClick={handleSaveAsPlaylist}
              disabled={favoriteSongs.length === 0 || creatingPlaylist}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save all favorites into a new playlist"
            >
              <ListPlus className="w-4 h-4" /> Save as Playlist
            </button>
          </div>
        </div>

        {createdNotice && (
          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            {createdNotice}
          </div>
        )}

        {/* Filter bar if favorites exist */}
        {favoriteSongs.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mood-black/40" />
              <input 
                type="text"
                placeholder="Filter your favorites..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-mood-black/10 text-sm focus:outline-none focus:border-mood-cobalt"
              />
            </div>
            <span className="text-xs text-mood-black/50 font-medium">
              Showing {filteredFavorites.length} of {favoriteSongs.length}
            </span>
          </div>
        )}

        {/* Favorites Track List / Cards */}
        {favoriteSongs.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-mood-black/5 p-8 shadow-sm">
            <div className="w-20 h-20 rounded-full bg-mood-mustard/10 flex items-center justify-center text-mood-mustard mb-4">
              <Heart className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-mood-forest mb-2">No Favorites Yet</h3>
            <p className="text-mood-black/60 max-w-md text-sm mb-6">
              Tap the heart icon on any track in Discover or Mood Studio to build your personal library of saved favorites.
            </p>
            <button
              onClick={() => setCurrentView && setCurrentView('discover')}
              className="px-6 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl font-bold text-sm hover:bg-mood-forest/90 transition-colors"
            >
              Explore Discover
            </button>
          </div>
        ) : filteredFavorites.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-mood-black/5 text-mood-black/50 text-sm">
            No favorite tracks match "{search}".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredFavorites.map((song) => {
              const songId = song._id || song.id || song.songId;
              const hasAudio = Boolean(song.audioUrl || song.previewUrl || song.isPlayable || song.youtubeId);

              return (
                <div 
                  key={songId} 
                  className="bg-white rounded-2xl p-4 border border-mood-black/5 hover:border-mood-black/15 hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-mood-black/5">
                      <SongCover 
                        src={song.cover || song.albumArt} 
                        title={song.title} 
                        artist={song.artist}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <button 
                        onClick={() => {
                          if (setQueue && filteredFavorites) setQueue(filteredFavorites);
                          setCurrentSong(song);
                        }}
                        className="absolute inset-0 bg-mood-forest/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Play Track"
                      >
                        <div className="w-12 h-12 bg-mood-lime rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                          <Play className="w-6 h-6 text-mood-forest ml-0.5 fill-current" />
                        </div>
                      </button>
                    </div>

                    <div>
                      <h4 className="font-bold text-mood-forest text-sm truncate group-hover:text-mood-cobalt transition-colors">
                        {song.title}
                      </h4>
                      <p className="text-xs text-mood-black/60 truncate mt-0.5">{song.artist}</p>
                      
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {song.playbackType === 'full' || song.youtubeId ? (
                          <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/50">
                            Full Song
                          </span>
                        ) : hasAudio ? (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                            30s Preview
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-mood-black/50 bg-mood-black/5 px-1.5 py-0.5 rounded">
                            Metadata
                          </span>
                        )}
                        {song.genre && (
                          <span className="text-[9px] text-mood-black/60 bg-mood-black/5 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                            {song.genre}
                          </span>
                        )}
                        {song.mood && (
                          <span className="text-[9px] text-mood-forest font-semibold bg-mood-forest/10 px-1.5 py-0.5 rounded">
                            {song.mood}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-mood-black/5">
                    <button
                      onClick={() => onOpenAddToPlaylist && onOpenAddToPlaylist(song)}
                      className="text-xs font-semibold text-mood-cobalt hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Playlist
                    </button>

                    <button
                      onClick={(e) => toggleFavorite(song, e)}
                      className="p-1.5 rounded-full hover:bg-mood-black/5 text-mood-mustard transition-colors"
                      title="Remove from favorites"
                    >
                      <Heart className="w-5 h-5 fill-mood-mustard" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default Favorites;
