import React, { useState, useEffect, useMemo } from 'react';
import { 
  History as HistoryIcon, Play, Trash2, Heart, 
  Plus, Clock, CheckCircle2, AlertCircle, Sparkles, Loader, BookOpen 
} from 'lucide-react';
import SongCover from '../components/SongCover';
import * as api from '../services/api';

const History = ({ 
  setCurrentSong, 
  setQueue,
  favorites = new Set(), 
  toggleFavorite, 
  onOpenAddToPlaylist, 
  setCurrentView,
  user
}) => {
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await api.getHistory();
      setHistoryItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const playableHistoryList = useMemo(() => {
    return historyItems
      .filter(item => Boolean(item.audioUrl || item.isPlayable))
      .map(item => ({
        _id: item.songId || item._id,
        id: item.songId || item._id,
        title: item.title,
        artist: item.artist,
        cover: item.cover,
        albumArt: item.cover,
        audioUrl: item.audioUrl,
        previewUrl: item.audioUrl,
        genre: item.genre,
        mood: item.mood,
        isPlayable: true
      }));
  }, [historyItems]);

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your listening history? This action cannot be undone.')) return;
    setClearing(true);
    try {
      await api.clearHistory();
      setHistoryItems([]);
    } catch (err) {
      alert('Failed to clear history');
    } finally {
      setClearing(false);
    }
  };

  const formatListenedTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0s';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="pb-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-8">
        
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-mood-cobalt/10 border border-mood-cobalt/20 flex items-center justify-center text-mood-cobalt shrink-0">
              <HistoryIcon className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-mood-forest tracking-tight">Listening History</h1>
              <p className="text-sm text-mood-black/60 mt-0.5">
                Tracks you've recently played and listened to
                {!user && ' • Saved locally on this browser'}
              </p>
            </div>
          </div>

          {historyItems.length > 0 && (
            <button
              onClick={handleClearHistory}
              disabled={clearing}
              className="px-4 py-2.5 rounded-xl border border-mood-sad/30 text-mood-sad hover:bg-mood-sad/10 text-xs font-bold transition-colors flex items-center gap-2 self-start sm:self-auto"
            >
              <Trash2 className="w-4 h-4" /> {clearing ? 'Clearing...' : 'Clear History'}
            </button>
          )}
        </div>

        {/* Mood Journal & Reflections Link Banner */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-mood-black/5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-mood-forest/10 flex items-center justify-center text-mood-forest shrink-0">
              <BookOpen className="w-5 h-5 text-mood-cobalt" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-mood-forest uppercase tracking-wider">Mood Journal & Reflections</h4>
              <p className="text-xs text-mood-black/60">View your recorded mood reflections and how your feelings connect with your music</p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView && setCurrentView('mood-insights')}
            className="px-4 py-2 bg-mood-forest text-mood-offwhite text-xs font-bold rounded-xl hover:bg-mood-forest/90 transition-all shrink-0 self-start sm:self-auto shadow-xs"
          >
            Open Mood Journal →
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-mood-black/40">
            <Loader className="w-8 h-8 animate-spin mb-3 text-mood-forest" />
            <p className="text-sm font-semibold">Loading history...</p>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-mood-black/5 p-8 shadow-sm">
            <div className="w-20 h-20 rounded-full bg-mood-black/5 flex items-center justify-center text-mood-black/40 mb-4">
              <Clock className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-mood-forest mb-2">No Listening History</h3>
            <p className="text-mood-black/60 max-w-md text-sm mb-6">
              When you play tracks, your listening sessions, completion rates, and song stats will appear here.
            </p>
            <button
              onClick={() => setCurrentView && setCurrentView('discover')}
              className="px-6 py-2.5 bg-mood-forest text-mood-offwhite rounded-xl font-bold text-sm hover:bg-mood-forest/90 transition-colors"
            >
              Explore Music
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-mood-black/5 shadow-sm divide-y divide-mood-black/5 overflow-hidden">
            {historyItems.map((item, idx) => {
                const songId = item.songId || item._id;
                const rawStr = String(songId || '');
                const isFav = favorites.has(songId) || favorites.has(rawStr) || 
                  (rawStr.startsWith('itunes_') && favorites.has(rawStr.slice(7))) ||
                  (/^\d+$/.test(rawStr) && favorites.has(`itunes_${rawStr}`));
                const isPlayable = Boolean(item.audioUrl || item.isPlayable);

                // Construct a playable song object
                const songObj = {
                  _id: songId,
                  id: songId,
                  title: item.title,
                  artist: item.artist,
                  cover: item.cover,
                  albumArt: item.cover,
                  audioUrl: item.audioUrl,
                  previewUrl: item.audioUrl,
                  genre: item.genre,
                  mood: item.mood,
                  isPlayable: isPlayable
                };

                return (
                  <div 
                    key={`${item._id || idx}-${idx}`}
                    className="p-4 flex items-center justify-between hover:bg-mood-black/[0.02] transition-colors group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <button 
                        onClick={() => {
                          if (setQueue && playableHistoryList.length > 0) setQueue(playableHistoryList);
                          setCurrentSong(songObj);
                        }}
                        disabled={!isPlayable}
                        className="w-8 h-8 rounded-full bg-mood-forest/5 hover:bg-mood-lime hover:text-mood-forest flex items-center justify-center text-mood-forest transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        title={isPlayable ? "Play Track" : "Audio unavailable for replay"}
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </button>

                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-sm">
                        <SongCover 
                          src={item.cover} 
                          title={item.title} 
                          artist={item.artist}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="min-w-0">
                        <h4 
                          onClick={() => {
                            if (isPlayable) {
                              if (setQueue && playableHistoryList.length > 0) setQueue(playableHistoryList);
                              setCurrentSong(songObj);
                            }
                          }}
                          className={`font-bold text-sm truncate ${isPlayable ? 'text-mood-forest hover:text-mood-cobalt cursor-pointer' : 'text-mood-forest'}`}
                        >
                          {item.title}
                        </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-mood-black/60 truncate">{item.artist}</span>
                        {item.genre && (
                          <span className="text-[10px] text-mood-black/40 bg-mood-black/5 px-1.5 py-0.2 rounded hidden sm:inline-block">
                            {item.genre}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* Status badges */}
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-semibold text-mood-forest flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3 text-mood-black/40" />
                        {formatListenedTime(item.listenedDuration)}
                      </p>
                      <p className="text-[10px] text-mood-black/40">
                        {item.completed ? (
                          <span className="text-emerald-600 font-semibold">Completed</span>
                        ) : item.skipped ? (
                          <span className="text-amber-600">Skipped early</span>
                        ) : (
                          <span>Listened</span>
                        )}
                        {' • '}{formatRelativeTime(item.playedAt || item.timestamp || item.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    {onOpenAddToPlaylist && (
                      <button
                        onClick={() => onOpenAddToPlaylist(songObj)}
                        className="p-1.5 text-mood-black/30 hover:text-mood-cobalt transition-colors"
                        title="Add to Playlist"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}

                    {toggleFavorite && (
                      <button
                        onClick={(e) => toggleFavorite(songObj, e)}
                        className="p-1.5 text-mood-black/30 hover:text-mood-mustard transition-colors"
                        title="Toggle Favorite"
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
    </div>
  );
};

export default History;
