import React, { useState, useEffect } from 'react';
import { 
  Music, Plus, Play, Shuffle, Trash2, Edit3, 
  ChevronLeft, MoreVertical, Heart, X, Check, Loader, Sparkles 
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const Playlists = ({ 
  setCurrentSong, 
  setQueue, 
  favorites = new Set(), 
  toggleFavorite, 
  setCurrentView,
  user
}) => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePlaylist, setActivePlaylist] = useState(null);
  
  // Create / Edit modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const data = await api.getPlaylists();
      setPlaylists(data);
      if (activePlaylist) {
        const refreshed = data.find(p => (p._id || p.id) === (activePlaylist._id || activePlaylist.id));
        if (refreshed) setActivePlaylist(refreshed);
      }
    } catch (err) {
      console.warn('Failed to load playlists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, [user]);

  useEffect(() => {
    const handlePlaylistsChanged = () => {
      fetchPlaylists();
    };
    window.addEventListener('moodify:playlists-changed', handlePlaylistsChanged);
    return () => {
      window.removeEventListener('moodify:playlists-changed', handlePlaylistsChanged);
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createPlaylist({
        name: playlistName.trim(),
        description: playlistDesc.trim()
      });
      setPlaylistName('');
      setPlaylistDesc('');
      setIsCreateOpen(false);
      await fetchPlaylists();
      setActivePlaylist(created);
    } catch (err) {
      setError(err.message || 'Failed to create playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!playlistName.trim() || !activePlaylist) return;
    setSaving(true);
    setError(null);
    try {
      const id = activePlaylist._id || activePlaylist.id;
      const updated = await api.updatePlaylist(id, {
        name: playlistName.trim(),
        description: playlistDesc.trim()
      });
      setIsEditOpen(false);
      await fetchPlaylists();
      setActivePlaylist(updated);
    } catch (err) {
      setError(err.message || 'Failed to update playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this playlist?')) return;
    try {
      await api.deletePlaylist(id);
      if (activePlaylist && (activePlaylist._id || activePlaylist.id) === id) {
        setActivePlaylist(null);
      }
      await fetchPlaylists();
    } catch (err) {
      alert(err.message || 'Failed to delete playlist');
    }
  };

  const handleRemoveSong = async (playlistId, songId) => {
    try {
      const updated = await api.removeSongFromPlaylist(playlistId, songId);
      setActivePlaylist(updated);
      await fetchPlaylists();
    } catch (err) {
      alert(err.message || 'Failed to remove song');
    }
  };

  const handlePlayPlaylist = (playlist, shuffle = false) => {
    if (!playlist.songs || playlist.songs.length === 0) return;
    let list = [...playlist.songs];
    if (shuffle) {
      list.sort(() => Math.random() - 0.5);
    }
    if (setQueue) setQueue(list);
    setCurrentSong(list[0]);
  };

  return (
    <div className="pb-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-8">
        
        {/* VIEW 1: PLAYLIST DETAIL VIEW */}
        {activePlaylist ? (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Back Button */}
            <button 
              onClick={() => setActivePlaylist(null)}
              className="flex items-center gap-2 text-sm font-bold text-mood-forest hover:text-mood-cobalt transition-colors"
            >
              <ChevronLeft className="w-5 h-5" /> Back to All Playlists
            </button>

            {/* Playlist Header Banner */}
            <div className="bg-gradient-to-r from-mood-forest to-[#1c3821] rounded-3xl p-8 md:p-10 text-mood-offwhite shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="flex items-center gap-6 relative z-10">
                <div className="w-28 h-28 rounded-2xl bg-mood-lime/20 border border-mood-lime/30 flex items-center justify-center shrink-0 shadow-inner">
                  <Music className="w-14 h-14 text-mood-lime" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-mood-lime">Playlist</span>
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{activePlaylist.name}</h1>
                  {activePlaylist.description && (
                    <p className="text-mood-offwhite/80 text-sm max-w-xl">{activePlaylist.description}</p>
                  )}
                  <p className="text-mood-offwhite/60 text-xs pt-1">
                    {activePlaylist.songs?.length || 0} {activePlaylist.songs?.length === 1 ? 'song' : 'songs'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 relative z-10">
                <button
                  onClick={() => handlePlayPlaylist(activePlaylist, false)}
                  disabled={!activePlaylist.songs || activePlaylist.songs.length === 0}
                  className="px-6 py-3 rounded-full bg-mood-lime text-mood-forest font-bold text-sm hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-current" /> Play
                </button>
                <button
                  onClick={() => handlePlayPlaylist(activePlaylist, true)}
                  disabled={!activePlaylist.songs || activePlaylist.songs.length === 0}
                  className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Shuffle className="w-4 h-4" /> Shuffle
                </button>
                <button
                  onClick={() => {
                    setPlaylistName(activePlaylist.name);
                    setPlaylistDesc(activePlaylist.description || '');
                    setIsEditOpen(true);
                  }}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Edit details"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(activePlaylist._id || activePlaylist.id)}
                  className="p-3 rounded-full bg-white/10 hover:bg-red-500/30 text-white hover:text-red-300 transition-colors"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Songs List */}
            {(!activePlaylist.songs || activePlaylist.songs.length === 0) ? (
              <div className="py-16 text-center bg-white rounded-3xl border border-mood-black/5 p-8 shadow-sm">
                <Music className="w-12 h-12 text-mood-black/30 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-mood-forest mb-1">This playlist is empty</h3>
                <p className="text-sm text-mood-black/60 mb-6">
                  Add tracks to this playlist from Discover, Mood Studio, or your Favorites!
                </p>
                <button
                  onClick={() => setCurrentView && setCurrentView('discover')}
                  className="px-5 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl text-sm font-bold hover:bg-mood-forest/90 transition-colors"
                >
                  Find Songs in Discover
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-mood-black/5 shadow-sm divide-y divide-mood-black/5 overflow-hidden">
                {activePlaylist.songs.map((song, idx) => {
                  const songId = song.songId || song._id || song.id;
                  const isFav = favorites.has(songId);
                  const hasAudio = Boolean(song.audioUrl || song.isPlayable || song.youtubeId);

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
                            if (setQueue && selectedPlaylist?.songs) setQueue(selectedPlaylist.songs);
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
                              if (setQueue && selectedPlaylist?.songs) setQueue(selectedPlaylist.songs);
                              setCurrentSong(song);
                            }}
                            className="font-bold text-mood-forest text-sm truncate hover:text-mood-cobalt cursor-pointer"
                          >
                            {song.title}
                          </h4>
                          <p className="text-xs text-mood-black/60 truncate">{song.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {song.playbackType === 'full' || song.youtubeId ? (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200/50">
                            Full Song
                          </span>
                        ) : hasAudio ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                            30s Preview
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-mood-black/50 bg-mood-black/5 px-2 py-0.5 rounded">
                            Metadata
                          </span>
                        )}

                        {toggleFavorite && (
                          <button
                            onClick={(e) => toggleFavorite(song, e)}
                            className="p-1.5 text-mood-black/30 hover:text-mood-mustard transition-colors"
                            title="Toggle Favorite"
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                          </button>
                        )}

                        <button
                          onClick={() => handleRemoveSong(activePlaylist._id || activePlaylist.id, songId)}
                          className="p-1.5 text-mood-black/30 hover:text-mood-sad transition-colors"
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
        ) : (
          /* VIEW 2: ALL PLAYLISTS GALLERY */
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-mood-forest tracking-tight">My Playlists</h1>
                <p className="text-sm text-mood-black/60 mt-1">
                  Create and organize your favorite soundtrack collections
                  {!user && ' • Saved locally on this browser'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
                <button
                  onClick={() => setCurrentView && setCurrentView('smart-builder')}
                  className="px-5 py-2.5 rounded-full bg-mood-lime text-mood-forest font-bold text-sm hover:bg-[#c4e466] transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-mood-forest" /> Smart Builder
                </button>
                <button
                  onClick={() => {
                    setPlaylistName('');
                    setPlaylistDesc('');
                    setIsCreateOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-full bg-mood-forest text-mood-offwhite font-bold text-sm hover:bg-mood-forest/90 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> New Playlist
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-mood-black/40">
                <Loader className="w-8 h-8 animate-spin mb-3 text-mood-forest" />
                <p className="text-sm font-semibold">Loading your playlists...</p>
              </div>
            ) : playlists.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-mood-black/5 p-8 shadow-sm">
                <div className="w-20 h-20 rounded-full bg-mood-forest/10 flex items-center justify-center text-mood-forest mb-4">
                  <Music className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-mood-forest mb-2">No Playlists Yet</h3>
                <p className="text-mood-black/60 max-w-md text-sm mb-6">
                  Create custom playlists for different vibes, workouts, study sessions, or moods!
                </p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="px-6 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl font-bold text-sm hover:bg-mood-forest/90 transition-colors"
                >
                  Create Your First Playlist
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {playlists.map((pl) => {
                  const songCount = pl.songs?.length || 0;
                  const firstSong = pl.songs && pl.songs[0];

                  return (
                    <div
                      key={pl._id || pl.id}
                      onClick={() => setActivePlaylist(pl)}
                      className="bg-white rounded-3xl p-5 border border-mood-black/5 hover:border-mood-black/15 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        <div className="aspect-square w-full rounded-2xl bg-mood-forest/5 overflow-hidden relative border border-mood-black/5">
                          {firstSong ? (
                            <SongCover 
                              src={firstSong.cover || firstSong.albumArt} 
                              title={firstSong.title} 
                              artist={firstSong.artist}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-mood-forest/10 to-mood-cobalt/10">
                              <Music className="w-12 h-12 text-mood-forest/40" />
                            </div>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPlaylist(pl, false);
                            }}
                            disabled={songCount === 0}
                            className="absolute bottom-3 right-3 w-11 h-11 bg-mood-lime rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all disabled:hidden"
                            title="Play playlist"
                          >
                            <Play className="w-5 h-5 text-mood-forest ml-0.5 fill-current" />
                          </button>
                        </div>

                        <div>
                          <h3 className="font-bold text-mood-forest text-base truncate group-hover:text-mood-cobalt transition-colors">
                            {pl.name}
                          </h3>
                          {pl.description && (
                            <p className="text-xs text-mood-black/60 truncate mt-0.5">{pl.description}</p>
                          )}
                          <p className="text-xs font-semibold text-mood-forest/60 mt-1">
                            {songCount} {songCount === 1 ? 'track' : 'tracks'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-mood-black/5 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-mood-cobalt group-hover:underline">
                          View tracks →
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(pl._id || pl.id);
                          }}
                          className="p-1 text-mood-black/30 hover:text-mood-sad transition-colors"
                          title="Delete"
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

        {/* MODAL: CREATE PLAYLIST */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-mood-black/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-mood-forest">Create New Playlist</h3>
                <button onClick={() => setIsCreateOpen(false)} className="p-1 rounded-full text-mood-black/40 hover:text-mood-forest">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">Playlist Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Late Night Vibes"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-mood-black/10 text-sm focus:outline-none focus:border-mood-cobalt"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Describe the mood or style of this playlist..."
                    value={playlistDesc}
                    onChange={(e) => setPlaylistDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-mood-black/10 text-sm focus:outline-none focus:border-mood-cobalt"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-mood-black/60 hover:bg-mood-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!playlistName.trim() || saving}
                    className="px-5 py-2 rounded-xl bg-mood-forest text-mood-offwhite text-sm font-bold hover:bg-mood-forest/90 disabled:opacity-40"
                  >
                    {saving ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: EDIT PLAYLIST */}
        {isEditOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-mood-black/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-mood-forest">Edit Playlist</h3>
                <button onClick={() => setIsEditOpen(false)} className="p-1 rounded-full text-mood-black/40 hover:text-mood-forest">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}

              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">Playlist Name</label>
                  <input
                    type="text"
                    required
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-mood-black/10 text-sm focus:outline-none focus:border-mood-cobalt"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-mood-forest mb-1 uppercase tracking-wider">Description</label>
                  <textarea
                    rows={2}
                    value={playlistDesc}
                    onChange={(e) => setPlaylistDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-mood-black/10 text-sm focus:outline-none focus:border-mood-cobalt"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-mood-black/60 hover:bg-mood-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!playlistName.trim() || saving}
                    className="px-5 py-2 rounded-xl bg-mood-forest text-mood-offwhite text-sm font-bold hover:bg-mood-forest/90 disabled:opacity-40"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
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

export default Playlists;
