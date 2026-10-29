import React, { useState, useEffect } from 'react';
import { X, Plus, Check, Music, Loader } from 'lucide-react';
import SongCover from './SongCover';
import * as api from '../services/api';

export const AddToPlaylistModal = ({ song, isOpen, onClose, onPlaylistUpdated }) => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [successId, setSuccessId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchPlaylists = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.getPlaylists();
        setPlaylists(list);
      } catch (err) {
        setError('Failed to load playlists');
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylists();
  }, [isOpen]);

  if (!isOpen || !song) return null;

  const handleAdd = async (playlistId) => {
    setAddingId(playlistId);
    setError(null);
    try {
      await api.addSongToPlaylist(playlistId, song);
      setSuccessId(playlistId);
      if (onPlaylistUpdated) onPlaylistUpdated();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to add song');
    } finally {
      setAddingId(null);
    }
  };

  const handleCreateAndAdd = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await api.createPlaylist({
        name: newPlaylistName.trim(),
        description: 'Created from song menu',
        songs: [song]
      });
      setSuccessId(created._id || created.id);
      if (onPlaylistUpdated) onPlaylistUpdated();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to create playlist');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-mood-black/10 overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-mood-black/5 flex items-center justify-between bg-mood-offwhite">
          <div>
            <h3 className="text-lg font-bold text-mood-forest">Add to Playlist</h3>
            <p className="text-xs text-mood-black/60">Choose a playlist or create a new one</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-mood-black/5 text-mood-black/40 hover:text-mood-forest transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Song Preview */}
        <div className="p-4 bg-mood-forest/5 border-b border-mood-black/5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm shrink-0">
            <SongCover 
              src={song.cover || song.albumArt} 
              title={song.title} 
              artist={song.artist}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-mood-forest text-sm truncate">{song.title}</h4>
            <p className="text-xs text-mood-black/60 truncate">{song.artist}</p>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        {/* Create New Playlist Input */}
        <form onSubmit={handleCreateAndAdd} className="p-4 border-b border-mood-black/5 flex gap-2">
          <input 
            type="text"
            placeholder="New playlist name..."
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            className="flex-1 px-4 py-2 bg-mood-black/5 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-mood-cobalt/20 border border-transparent focus:border-mood-cobalt"
          />
          <button 
            type="submit"
            disabled={!newPlaylistName.trim() || isCreating}
            className="px-4 py-2 bg-mood-forest text-mood-offwhite rounded-xl text-sm font-bold hover:bg-mood-forest/90 disabled:opacity-40 transition-colors flex items-center gap-1 shrink-0"
          >
            {isCreating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create & Add
          </button>
        </form>

        {/* Playlists List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-mood-black/40">
              <Loader className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs font-medium">Loading playlists...</span>
            </div>
          ) : playlists.length === 0 ? (
            <div className="py-8 text-center text-mood-black/50 text-xs">
              No playlists found. Create your first playlist above!
            </div>
          ) : (
            playlists.map((pl) => {
              const pId = pl._id || pl.id;
              const isAdding = addingId === pId;
              const isDone = successId === pId;
              const songCount = pl.songs ? pl.songs.length : 0;

              return (
                <button
                  key={pId}
                  onClick={() => handleAdd(pId)}
                  disabled={isAdding || isDone}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isDone 
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                      : 'bg-white border-mood-black/5 hover:border-mood-cobalt/30 hover:bg-mood-cobalt/5 text-mood-forest'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-mood-forest/10 flex items-center justify-center text-mood-forest shrink-0">
                      <Music className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{pl.name}</p>
                      <p className="text-xs text-mood-black/50">{songCount} {songCount === 1 ? 'song' : 'songs'}</p>
                    </div>
                  </div>

                  <div className="shrink-0 ml-3">
                    {isAdding && <Loader className="w-5 h-5 animate-spin text-mood-cobalt" />}
                    {isDone && <Check className="w-5 h-5 text-emerald-600" />}
                    {!isAdding && !isDone && (
                      <span className="text-xs font-bold text-mood-cobalt hover:underline">+ Add</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};

export default AddToPlaylistModal;
