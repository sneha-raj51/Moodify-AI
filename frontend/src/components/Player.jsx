import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Maximize2, Minimize2, X, AlertCircle, Heart, Shuffle, 
  Repeat, Repeat1, ListMusic, Music, ChevronDown, Check,
  Mic2, ExternalLink, Sparkles, ThumbsUp, ThumbsDown
} from 'lucide-react';
import SongCover from './SongCover';
import * as api from '../services/api';

/**
 * Parses LRC synchronized lyrics string into an array of { time: seconds, text: string }
 */
const parseLrc = (lrcString) => {
  if (!lrcString || typeof lrcString !== 'string') return [];
  const lines = lrcString.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{1,3})?\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const frac = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const time = mins * 60 + secs + frac / 1000;
      const text = line.replace(/\[\d{2}:\d{2}\.?\d{0,3}\]/g, '').trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
};

const Player = ({ 
  currentSong, 
  playlist = [], 
  setCurrentSong, 
  onClose,
  favorites = new Set(),
  toggleFavorite,
  queue = [],
  setQueue,
  onOpenAddToPlaylist,
  onSongFinished
}) => {
  const audioRef = useRef(null);
  const lyricsContainerRef = useRef(null);
  const loggedSongIdRef = useRef(null);
  const historyRecordIdRef = useRef(null);
  const meaningfulLoggedRef = useRef(false);
  const completedLoggedRef = useRef(false);

  // Playback state - strictly synchronized with HTML5 Audio element
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);
  
  // View states
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
  const [expandedTab, setExpandedTab] = useState('artwork'); // 'artwork' | 'lyrics'

  // Lyrics state
  const [lyricsData, setLyricsData] = useState(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  // User Recommendation Feedback State (like | dislike)
  const [currentFeedback, setCurrentFeedback] = useState(null);

  useEffect(() => {
    if (!currentSong) {
      setCurrentFeedback(null);
      return;
    }
    const songId = currentSong._id || currentSong.id || currentSong.songId;
    if (songId) {
      api.getFeedback().then(list => {
        const match = (list || []).find(f => String(f.songId) === String(songId));
        if (match && (match.action === 'like' || match.action === 'dislike')) {
          setCurrentFeedback(match.action);
        } else {
          setCurrentFeedback(null);
        }
      }).catch(() => setCurrentFeedback(null));
    }
  }, [currentSong]);

  const handleFeedback = async (action) => {
    if (!currentSong) return;
    const songId = currentSong._id || currentSong.id || currentSong.songId;
    if (!songId) return;

    if (currentFeedback === action) {
      setCurrentFeedback(null);
      try {
        await api.deleteFeedback(String(songId), action);
      } catch (e) {
        console.warn('Delete feedback error:', e);
      }
    } else {
      setCurrentFeedback(action);
      try {
        await api.recordFeedback({
          songId: String(songId),
          action,
          title: currentSong.title,
          artist: currentSong.artist,
          genre: currentSong.genre,
          mood: currentSong.mood,
          source: currentSong.provider || 'mongodb',
          externalId: currentSong.externalId
        });
      } catch (e) {
        console.warn('Record feedback error:', e);
      }
    }
  };

  // Active queue or playlist
  const activeList = queue && queue.length > 0 ? queue : playlist;
  const currentId = currentSong ? (currentSong._id || currentSong.id || currentSong.songId) : null;
  const isFav = currentSong ? Boolean(
    (currentSong._id && (favorites.has(currentSong._id) || favorites.has(String(currentSong._id)))) ||
    (currentSong.id && (favorites.has(currentSong.id) || favorites.has(String(currentSong.id)))) ||
    (currentSong.songId && (favorites.has(currentSong.songId) || favorites.has(String(currentSong.songId))))
  ) : false;

  const isValidAudio = (url) => {
    if (!url || typeof url !== 'string') return false;
    const cleanUrl = url.trim().toLowerCase();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return false;
    if (/\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?.*)?$/i.test(cleanUrl)) return false;
    return true;
  };

  // Find canonical version from playlist if currentSong comes from stale history/cache
  const canonicalSong = useMemo(() => {
    if (!currentSong) return null;
    const cId = currentSong._id || currentSong.id || currentSong.songId;
    return playlist.find(s => (s._id || s.id) === cId || (s.title && s.title.toLowerCase() === (currentSong.title || '').toLowerCase())) || currentSong;
  }, [currentSong, playlist]);

  const rawAudio = canonicalSong?.audioUrl || currentSong?.audioUrl;
  const rawPreview = canonicalSong?.previewUrl || currentSong?.previewUrl;
  const audioUrl = isValidAudio(rawAudio) ? rawAudio : (isValidAudio(rawPreview) ? rawPreview : null);
  const hasAudio = Boolean(audioUrl);
  const providerKey = (canonicalSong?.provider || currentSong?.provider || canonicalSong?.source || currentSong?.source || 'mongodb').toLowerCase();
  const sourceLabel = canonicalSong?.sourceLabel || currentSong?.sourceLabel || (
    providerKey === 'audius' ? 'Audius' :
    providerKey === 'jamendo' ? 'Jamendo' :
    providerKey === 'itunes' ? 'iTunes' : 'Moodify'
  );
  const isFullAudio = Boolean(
    canonicalSong?.isFullAudio ||
    currentSong?.isFullAudio ||
    providerKey === 'audius' ||
    providerKey === 'jamendo' ||
    (canonicalSong?.playbackType === 'full' && hasAudio && !audioUrl?.includes('itunes'))
  );

  // --- Real HTML5 Audio Playback Engine ---
  useEffect(() => {
    if (!canonicalSong) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      setIsPlaying(false);
      setIsLoading(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    // Reset state for new song
    setCurrentTime(0);
    setError(null);

    if (!audioUrl) {
      audio.pause();
      audio.removeAttribute('src');
      setIsPlaying(false);
      setIsLoading(false);
      setDuration(isFullAudio ? (canonicalSong.duration || 240) : 30);
      setError('Audio stream unavailable for this track.');
      return;
    }

    setIsLoading(true);
    audio.pause();
    audio.src = audioUrl;
    audio.volume = isMuted ? 0 : volume;

    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setError(null);
      logListenEvent();
    };

    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onWaiting = () => {
      setIsLoading(true);
    };

    const onCanPlay = () => {
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      if (typeof audio.currentTime === 'number' && !isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
        if (audio.currentTime >= 15 && !meaningfulLoggedRef.current && historyRecordIdRef.current) {
          meaningfulLoggedRef.current = true;
          api.updateListen(historyRecordIdRef.current, {
            isMeaningful: true,
            listenedDuration: audio.currentTime
          }).catch(e => console.warn('Meaningful listen update notice:', e));
        }
      }
    };

    const onLoadedMetadata = () => {
      setIsLoading(false);
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else {
        setDuration(isFullAudio ? (canonicalSong.duration || 240) : 30);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      if (typeof onSongFinished === 'function' && canonicalSong) {
        onSongFinished(canonicalSong);
      }
      // Record completed status in listening history
      completedLoggedRef.current = true;
      meaningfulLoggedRef.current = true;
      if (historyRecordIdRef.current) {
        const finalDuration = (audio.duration && !isNaN(audio.duration) && audio.duration > 0) ? audio.duration : (duration || 30);
        api.updateListen(historyRecordIdRef.current, {
          completed: true,
          skipped: false,
          isMeaningful: true,
          listenedDuration: finalDuration
        }).catch(e => console.warn('History completion update notice:', e));
      }
      // Record complete feedback for recommendation engine personalization
      const sId = canonicalSong?._id || canonicalSong?.id || canonicalSong?.songId;
      if (sId) {
        api.recordFeedback({
          songId: String(sId),
          action: 'complete',
          title: canonicalSong?.title,
          artist: canonicalSong?.artist,
          genre: canonicalSong?.genre,
          mood: canonicalSong?.mood,
          source: canonicalSong?.provider || 'mongodb',
          externalId: canonicalSong?.externalId
        }).catch(() => {});
      }
      handleNext(true);
    };

    const onError = async () => {
      console.warn('Audio playback error on track:', canonicalSong?.title, audio?.error);
      setIsPlaying(false);
      setIsLoading(false);

      // Automatic fallback: Try resolving live preview from iTunes Search API
      if (canonicalSong?.title) {
        try {
          const liveTracks = await api.searchSongs(`${canonicalSong.title} ${canonicalSong.artist || ''}`);
          if (liveTracks && liveTracks.length > 0 && liveTracks[0].audioUrl) {
            const freshUrl = liveTracks[0].audioUrl;
            if (freshUrl && freshUrl !== audio.src && !freshUrl.endsWith(audio.src)) {
              console.log('Falling back to live iTunes preview stream for:', canonicalSong.title);
              audio.src = freshUrl;
              audio.play().then(() => {
                setIsPlaying(true);
                setError(null);
              }).catch(() => {});
              return;
            }
          }
        } catch (e) {
          console.warn('Live iTunes fallback notice:', e);
        }
      }

      let errMsg = 'Audio preview stream could not be loaded.';
      if (audio?.error) {
        if (audio.error.code === 4 || audio.error.code === (typeof MediaError !== 'undefined' && MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
          errMsg = 'Audio preview is unavailable from provider.';
        } else if (audio.error.code === 2 || audio.error.code === (typeof MediaError !== 'undefined' && MediaError.MEDIA_ERR_NETWORK)) {
          errMsg = 'Network error while streaming audio.';
        }
      }
      setError(errMsg);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Try starting playback
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(err => {
          console.info('Playback initialization notice:', err.name);
          setIsPlaying(false);
          setIsLoading(false);
          if (err.name === 'NotAllowedError') {
            setError('Autoplay paused by browser policy. Tap Play to listen.');
          } else if (err.name === 'NotSupportedError') {
            setError('Audio preview is unavailable from provider.');
          } else {
            setError(err.message || 'Unable to start audio stream.');
          }
        });
    }

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [canonicalSong?.id, canonicalSong?._id, canonicalSong?.title, audioUrl]);

  // Volume & Mute Sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Fetch Lyrics when currentSong changes
  useEffect(() => {
    if (!currentSong?.title) {
      setLyricsData(null);
      return;
    }
    let isCancelled = false;
    setIsLoadingLyrics(true);

    api.getLyrics(currentSong.title, currentSong.artist, currentSong.duration)
      .then(data => {
        if (!isCancelled) {
          setLyricsData(data);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          console.warn('Lyrics fetch warning:', err);
          setLyricsData({ plain: null, synced: null, lyricsAvailable: false });
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingLyrics(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentSong?.title, currentSong?.artist]);

  // Parsed synchronized lyrics
  const parsedLyrics = useMemo(() => {
    if (lyricsData?.synced) {
      return parseLrc(lyricsData.synced);
    }
    return [];
  }, [lyricsData?.synced]);

  // Find active lyric index for synced auto-scrolling
  const activeLyricIndex = useMemo(() => {
    if (!parsedLyrics || parsedLyrics.length === 0) return -1;
    for (let i = parsedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= parsedLyrics[i].time - 0.2) {
        return i;
      }
    }
    return 0;
  }, [parsedLyrics, currentTime]);

  // Auto-scroll lyrics container to active line
  useEffect(() => {
    if (expandedTab === 'lyrics' && activeLyricIndex >= 0 && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.children[activeLyricIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLyricIndex, expandedTab]);

  // Toggle Repeat mode: off -> all -> one -> off
  const cycleRepeatMode = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  // Next track logic
  const handleNext = (isNaturalEnd = false) => {
    if (!activeList || activeList.length === 0 || !setCurrentSong) return;

    if (!isNaturalEnd && historyRecordIdRef.current && !completedLoggedRef.current) {
      api.updateListen(historyRecordIdRef.current, { 
        skipped: true, 
        listenedDuration: currentTime 
      }).catch(e => console.warn('History update error:', e));

      // Record contextual skip feedback for recommendations if skipped early (< 15 seconds)
      const sId = currentSong?._id || currentSong?.id || currentSong?.songId;
      if (sId && currentTime < 15) {
        api.recordFeedback({
          songId: String(sId),
          action: 'skip',
          title: currentSong?.title,
          artist: currentSong?.artist,
          genre: currentSong?.genre,
          mood: currentSong?.mood,
          source: currentSong?.provider || 'mongodb',
          externalId: currentSong?.externalId
        }).catch(() => {});
      }
    }

    if (repeatMode === 'one' && audioRef.current && hasAudio) {
      seekTo(0);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      return;
    }

    if (isShuffle && activeList.length > 1) {
      const candidates = activeList.filter(s => (s._id || s.id || s.songId) !== currentId);
      const listToPick = candidates.length > 0 ? candidates : activeList;
      const randomSong = listToPick[Math.floor(Math.random() * listToPick.length)];
      setCurrentSong(randomSong);
      return;
    }

    const currentIndex = activeList.findIndex(s => (s._id || s.id || s.songId) === currentId);
    if (currentIndex === -1) {
      setCurrentSong(activeList[0]);
    } else if (currentIndex < activeList.length - 1) {
      setCurrentSong(activeList[currentIndex + 1]);
    } else if (repeatMode === 'all') {
      setCurrentSong(activeList[0]);
    } else {
      setIsPlaying(false);
    }
  };

  // Previous track logic
  const handlePrevious = () => {
    if (!activeList || activeList.length === 0 || !setCurrentSong) return;
    
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    if (repeatMode === 'one' && audioRef.current && hasAudio) {
      seekTo(0);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      return;
    }

    const currentIndex = activeList.findIndex(s => (s._id || s.id || s.songId) === currentId);
    if (currentIndex === -1) {
      setCurrentSong(activeList[0]);
    } else if (currentIndex > 0) {
      setCurrentSong(activeList[currentIndex - 1]);
    } else if (repeatMode === 'all') {
      setCurrentSong(activeList[activeList.length - 1]);
    } else {
      seekTo(0);
    }
  };

  // Log listen history event
  const logListenEvent = async () => {
    const songIdToLog = currentSong?._id || currentSong?.id || currentSong?.songId;
    if (loggedSongIdRef.current !== songIdToLog && songIdToLog) {
      loggedSongIdRef.current = songIdToLog;
      meaningfulLoggedRef.current = false;
      completedLoggedRef.current = false;
      historyRecordIdRef.current = null;

      try {
        const record = await api.logListen({
          songId: String(songIdToLog),
          title: currentSong.title,
          artist: currentSong.artist,
          cover: currentSong.cover || currentSong.albumArt,
          genre: currentSong.genre,
          mood: currentSong.mood,
          audioUrl: audioUrl,
          isPlayable: hasAudio,
          source: currentSong.provider || 'itunes'
        });
        if (record && record._id) {
          historyRecordIdRef.current = record._id;
        }
      } catch (e) {
        console.warn('Failed to log listen:', e);
      }
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!hasAudio) {
      setError('Audio stream unavailable for this track.');
      setIsPlaying(false);
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setError(null);
      setIsLoading(true);
      audio.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(err => {
          console.warn('Play attempt failed:', err);
          setIsPlaying(false);
          setIsLoading(false);
          if (err.name === 'NotAllowedError') {
            setError('Autoplay paused by browser policy. Tap Play to listen.');
          } else if (err.name === 'NotSupportedError') {
            setError('Audio preview is unavailable from provider.');
          } else {
            setError('Playback error: ' + (err.message || 'Unable to play stream'));
          }
        });
    }
  };

  const seekTo = (seconds) => {
    if (audioRef.current && hasAudio) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  // Window event listener for global companion / voice player controls
  useEffect(() => {
    const handlePlayerControl = (e) => {
      const command = e.detail?.command;
      const audio = audioRef.current;
      if (command === 'PAUSE') {
        if (audio && !audio.paused) {
          audio.pause();
          setIsPlaying(false);
        }
      } else if (command === 'RESUME' || command === 'PLAY') {
        if (audio && audio.paused && hasAudio) {
          setError(null);
          audio.play().then(() => setIsPlaying(true)).catch(err => {
            console.warn('Voice resume playback error:', err);
          });
        }
      } else if (command === 'NEXT' || command === 'PLAY_NEXT') {
        handleNext();
      } else if (command === 'PREVIOUS' || command === 'PLAY_PREVIOUS') {
        handlePrevious();
      } else if (command === 'TOGGLE_PLAY') {
        if (audio) {
          if (audio.paused && hasAudio) {
            setError(null);
            audio.play().then(() => setIsPlaying(true)).catch(err => {
              console.warn('Toggle play error:', err);
            });
          } else if (!audio.paused) {
            audio.pause();
            setIsPlaying(false);
          }
        }
      } else if (command === 'TOGGLE_SHUFFLE') {
        setIsShuffle(prev => !prev);
      }
    };

    window.addEventListener('moodify:player-control', handlePlayerControl);
    return () => {
      window.removeEventListener('moodify:player-control', handlePlayerControl);
    };
  }, [hasAudio, activeList, currentId, repeatMode, isShuffle, currentTime]);

  const handleSeek = (e) => {
    if (!hasAudio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const effectiveDuration = duration > 0 ? duration : (currentSong.duration || 30);
    const newTime = percent * effectiveDuration;
    seekTo(newTime);
  };

  const handleVolumeChange = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(percent);
    if (percent > 0) setIsMuted(false);
  };

  const formatTime = (time) => {
    if (isNaN(time) || time < 0) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentSong) return null;

  const effectiveDuration = duration > 0 ? duration : (currentSong.duration || 30);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;
  const coverUrl = currentSong.cover || currentSong.albumArt || canonicalSong?.cover || canonicalSong?.albumArt;

  return (
    <>
      {/* 1. BOTTOM PERSISTENT PLAYER (SPOTIFY STYLE AUDIO BAR) */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-mood-offwhite/95 backdrop-blur-md border-t border-mood-black/10 flex items-center justify-between px-4 md:px-8 z-40 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] select-none">
        
        {/* Track Info (Clickable to open expanded Spotify-style view) */}
        <div 
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3.5 w-1/3 min-w-[180px] max-w-sm cursor-pointer group"
          title="Click to expand Now Playing & Lyrics"
        >
          <div className="relative w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-mood-black/5 shrink-0 group-hover:scale-105 transition-transform bg-mood-black/5">
            <SongCover 
              src={coverUrl} 
              title={currentSong.title} 
              artist={currentSong.artist}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-white" />
            </div>
          </div>
          
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-mood-forest text-sm truncate group-hover:text-mood-cobalt transition-colors">
                {currentSong.title}
              </h4>
              {toggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(currentSong, e);
                  }}
                  className="p-1 rounded-full text-mood-black/40 hover:text-mood-mustard transition-colors shrink-0"
                  title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-mood-mustard text-mood-mustard' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFeedback('like');
                }}
                className={`p-1 rounded-full transition-colors shrink-0 ${
                  currentFeedback === 'like' ? 'text-mood-cobalt bg-mood-cobalt/10' : 'text-mood-black/30 hover:text-mood-cobalt'
                }`}
                title={currentFeedback === 'like' ? "Liked (Positively rated)" : "Like track (boosts recommendations)"}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${currentFeedback === 'like' ? 'fill-current' : ''}`} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFeedback('dislike');
                }}
                className={`p-1 rounded-full transition-colors shrink-0 ${
                  currentFeedback === 'dislike' ? 'text-rose-600 bg-rose-50' : 'text-mood-black/30 hover:text-rose-600'
                }`}
                title={currentFeedback === 'dislike' ? "Disliked (Deprioritized)" : "Dislike track (deprioritizes in recommendations)"}
              >
                <ThumbsDown className={`w-3.5 h-3.5 ${currentFeedback === 'dislike' ? 'fill-current' : ''}`} />
              </button>
            </div>
            
            <p className="text-xs text-mood-black/60 truncate mt-0.5">{currentSong.artist}</p>
            
            {/* Audio Badges & Error State */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {/* Provider Source Badge */}
              <span className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${
                providerKey === 'audius'
                  ? 'text-purple-700 bg-purple-50 border-purple-200'
                  : providerKey === 'jamendo'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : providerKey === 'itunes'
                  ? 'text-blue-700 bg-blue-50 border-blue-200'
                  : 'text-slate-700 bg-slate-50 border-slate-200'
              }`}>
                {sourceLabel}
              </span>

              {isFullAudio ? (
                <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300/60 px-1.5 py-0.5 rounded">
                  Full Track
                </span>
              ) : hasAudio ? (
                <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-mood-cobalt bg-mood-cobalt/10 border border-mood-cobalt/20 px-1.5 py-0.5 rounded">
                  30-sec Preview
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-amber-800 bg-amber-100 border border-amber-300/60 px-1.5 py-0.5 rounded">
                  Preview Unavailable
                </span>
              )}

              {currentSong.genre && (
                <span className="text-[9px] text-mood-forest/70 font-medium bg-mood-forest/5 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                  {currentSong.genre}
                </span>
              )}

              {currentSong.language && (
                <span className="text-[9px] text-mood-forest/70 font-medium bg-mood-forest/5 px-1.5 py-0.5 rounded">
                  {currentSong.language}
                </span>
              )}
            </div>

            {/* Error Message & Official Link */}
            {error && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 mt-1 text-[10px] text-amber-900 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md max-w-xs"
              >
                <AlertCircle className="w-3 h-3 text-amber-700 shrink-0" />
                <span className="truncate">{error}</span>
                {currentSong.externalUrl && (
                  <a
                    href={currentSong.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-0.5 font-bold text-mood-cobalt hover:underline shrink-0"
                    title="Open on official provider site"
                  >
                    <ExternalLink className="w-2.5 h-2.5" /> Web
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Controls & Progress Bar */}
        <div className="flex flex-col items-center justify-center flex-1 max-w-2xl px-2 md:px-6 gap-2">
          <div className="flex items-center gap-4 md:gap-6">
            
            {/* Shuffle */}
            <button 
              onClick={() => setIsShuffle(!isShuffle)}
              className={`p-1.5 rounded-full transition-colors ${
                isShuffle ? 'text-mood-cobalt bg-mood-cobalt/10' : 'text-mood-black/40 hover:text-mood-forest'
              }`}
              title={isShuffle ? "Shuffle On" : "Shuffle Off"}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Previous */}
            <button 
              onClick={handlePrevious}
              disabled={!activeList || activeList.length === 0}
              className="text-mood-black/70 hover:text-mood-forest transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed p-1"
              aria-label="Previous track"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            
            {/* Play / Pause - STRICT TRUTHFUL STATE */}
            <button 
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-mood-forest text-mood-offwhite flex items-center justify-center hover:bg-mood-forest/90 transition-transform hover:scale-105 active:scale-95 shadow-md"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button 
              onClick={handleNext}
              disabled={!activeList || activeList.length === 0}
              className="text-mood-black/70 hover:text-mood-forest transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed p-1"
              aria-label="Next track"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button 
              onClick={cycleRepeatMode}
              className={`p-1.5 rounded-full transition-colors ${
                repeatMode !== 'off' ? 'text-mood-cobalt bg-mood-cobalt/10' : 'text-mood-black/40 hover:text-mood-forest'
              }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          {/* Progress Bar & Timers */}
          <div className="w-full flex items-center gap-3">
            <span className="text-[11px] text-mood-black/40 font-mono w-9 text-right shrink-0">
              {formatTime(currentTime)}
            </span>
            
            <div 
              className="flex-1 h-1.5 bg-mood-black/10 rounded-full overflow-hidden cursor-pointer relative group/progress"
              onClick={handleSeek}
              title="Seek"
            >
              <div 
                className="h-full bg-mood-cobalt rounded-full transition-all group-hover/progress:bg-mood-forest"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <span className="text-[11px] text-mood-black/40 font-mono w-9 shrink-0">
              {formatTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Right Actions: Volume, Lyrics, Queue, Expand */}
        <div className="flex items-center justify-end gap-3 w-1/3 min-w-[160px] max-w-xs">
          
          {/* Quick Lyrics Button */}
          <button
            onClick={() => {
              setExpandedTab('lyrics');
              setIsExpanded(true);
            }}
            className="p-2 rounded-xl text-mood-black/50 hover:text-mood-cobalt hover:bg-mood-black/5 transition-colors hidden sm:flex items-center gap-1 text-xs font-semibold"
            title="View Lyrics"
          >
            <Mic2 className="w-4 h-4" />
            <span className="text-[11px]">Lyrics</span>
          </button>

          {/* Volume Control */}
          <div className="hidden md:flex items-center gap-2 group/volume">
            <button onClick={() => setIsMuted(!isMuted)} className="text-mood-black/50 hover:text-mood-forest transition-colors p-1">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div 
              className="w-16 lg:w-20 h-1.5 bg-mood-black/10 rounded-full overflow-hidden cursor-pointer"
              onClick={handleVolumeChange}
            >
              <div 
                className="h-full bg-mood-forest rounded-full"
                style={{ width: `${volumePercent}%` }}
              />
            </div>
          </div>

          {/* Queue Drawer Toggle */}
          <button 
            onClick={() => setShowQueue(!showQueue)}
            className={`p-2 rounded-xl transition-colors relative ${
              showQueue ? 'bg-mood-cobalt text-white' : 'text-mood-black/50 hover:text-mood-forest hover:bg-mood-black/5'
            }`}
            title="Toggle Queue"
          >
            <ListMusic className="w-4 h-4" />
            {queue && queue.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-mood-mustard text-mood-forest text-[10px] font-extrabold rounded-full flex items-center justify-center">
                {queue.length}
              </span>
            )}
          </button>

          {/* Maximize to Full View */}
          <button 
            onClick={() => setIsExpanded(true)}
            className="p-2 text-mood-black/50 hover:text-mood-forest hover:bg-mood-black/5 rounded-xl transition-colors"
            title="Expand Audio Player"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* 2. QUEUE DRAWER (SLIDE-OVER) */}
      {showQueue && (
        <div className="fixed bottom-24 right-4 md:right-8 w-80 md:w-96 max-h-[480px] bg-white rounded-3xl border border-mood-black/10 shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="p-4 border-b border-mood-black/5 flex items-center justify-between bg-mood-offwhite/50">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-mood-cobalt" />
              <h3 className="font-bold text-mood-forest text-sm">
                Playing Queue ({activeList.length})
              </h3>
            </div>
            <button onClick={() => setShowQueue(false)} className="text-mood-black/40 hover:text-mood-forest p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-2 divide-y divide-mood-black/5 flex-1">
            {activeList.map((song, idx) => {
              const songId = song._id || song.id || song.songId;
              const isCurrent = songId === currentId;
              return (
                <div 
                  key={`${songId}-${idx}`}
                  onClick={() => setCurrentSong(song)}
                  className={`p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-colors ${
                    isCurrent ? 'bg-mood-cobalt/10' : 'hover:bg-mood-black/5'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-mood-black/5">
                    <SongCover src={song.cover || song.albumArt} title={song.title} artist={song.artist} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold truncate ${isCurrent ? 'text-mood-cobalt' : 'text-mood-forest'}`}>
                      {song.title}
                    </p>
                    <p className="text-[11px] text-mood-black/60 truncate">{song.artist}</p>
                  </div>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-mood-cobalt animate-pulse shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. EXPANDED SPOTIFY-STYLE NOW PLAYING MODAL (PURE AUDIO) */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-mood-forest text-mood-offwhite flex flex-col justify-between p-6 md:p-10 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          
          {/* Top Bar */}
          <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
            <button 
              onClick={() => setIsExpanded(false)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-mood-offwhite transition-colors"
              title="Collapse"
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            {/* View Tabs: Artwork or Lyrics (No Video) */}
            <div className="flex items-center bg-white/10 rounded-full p-1 border border-white/10">
              <button
                onClick={() => setExpandedTab('artwork')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  expandedTab === 'artwork' ? 'bg-mood-lime text-mood-forest shadow-sm' : 'text-white/70 hover:text-white'
                }`}
              >
                Artwork
              </button>
              <button
                onClick={() => setExpandedTab('lyrics')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  expandedTab === 'lyrics' ? 'bg-mood-lime text-mood-forest shadow-sm' : 'text-white/70 hover:text-white'
                }`}
              >
                <Mic2 className="w-3.5 h-3.5" />
                Lyrics
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentSong.externalUrl && (
                <a
                  href={currentSong.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                  title="Open official track link"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
              {onOpenAddToPlaylist && (
                <button 
                  onClick={() => onOpenAddToPlaylist(currentSong)}
                  className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-mood-offwhite transition-colors"
                >
                  + Playlist
                </button>
              )}
            </div>
          </div>

          {/* Center Content: Artwork or Lyrics */}
          <div className="max-w-xl mx-auto w-full my-auto py-6 flex flex-col items-center">
            
            {/* TAB 1: COVER ARTWORK */}
            {expandedTab === 'artwork' && (
              <div className="w-72 h-72 md:w-96 md:h-96 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group mb-8 bg-black/20">
                <SongCover 
                  src={coverUrl} 
                  title={currentSong.title} 
                  artist={currentSong.artist}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  iconClassName="w-20 h-20 text-mood-lime"
                />
              </div>
            )}

            {/* TAB 2: SYNCHRONIZED LYRICS */}
            {expandedTab === 'lyrics' && (
              <div className="w-full max-w-lg h-80 md:h-96 my-4 px-4 overflow-y-auto rounded-3xl bg-black/20 border border-white/10 backdrop-blur-md flex flex-col relative scroll-smooth">
                {isLoadingLyrics ? (
                  <div className="m-auto flex flex-col items-center justify-center text-white/60 gap-3">
                    <div className="w-8 h-8 border-3 border-mood-lime/30 border-t-mood-lime rounded-full animate-spin" />
                    <p className="text-xs font-semibold">Finding verified lyrics...</p>
                  </div>
                ) : parsedLyrics.length > 0 ? (
                  <div ref={lyricsContainerRef} className="py-20 space-y-5 text-center">
                    {parsedLyrics.map((line, idx) => {
                      const isActive = idx === activeLyricIndex;
                      return (
                        <p
                          key={idx}
                          onClick={() => seekTo(line.time)}
                          className={`cursor-pointer transition-all duration-300 ${
                            isActive
                              ? 'text-mood-lime font-extrabold text-xl md:text-2xl scale-105'
                              : 'text-white/40 hover:text-white/80 font-medium text-sm md:text-base'
                          }`}
                        >
                          {line.text}
                        </p>
                      );
                    })}
                  </div>
                ) : lyricsData?.plain ? (
                  <div className="p-6 text-center whitespace-pre-line text-sm md:text-base text-white/80 leading-relaxed font-sans">
                    {lyricsData.plain}
                  </div>
                ) : (
                  <div className="m-auto text-center p-6 space-y-3">
                    <Mic2 className="w-10 h-10 text-white/30 mx-auto" />
                    <p className="font-bold text-white text-base">Lyrics Unavailable</p>
                    <p className="text-white/60 text-xs max-w-xs mx-auto">
                      Official lyrics are not yet indexed for "{currentSong.title}" by {currentSong.artist}.
                    </p>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${currentSong.artist} ${currentSong.title} lyrics`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Search on Web
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Track Info & Like Action */}
            <div className="w-full flex items-center justify-between mb-6">
              <div className="min-w-0 pr-4">
                <h2 className="text-2xl md:text-3xl font-extrabold text-white truncate tracking-tight">
                  {currentSong.title}
                </h2>
                <p className="text-base md:text-lg text-white/70 truncate mt-1">
                  {currentSong.artist}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Provider Source Badge */}
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    providerKey === 'audius'
                      ? 'text-purple-300 bg-purple-900/40 border-purple-400/40'
                      : providerKey === 'jamendo'
                      ? 'text-emerald-300 bg-emerald-900/40 border-emerald-400/40'
                      : providerKey === 'itunes'
                      ? 'text-blue-300 bg-blue-900/40 border-blue-400/40'
                      : 'text-white/80 bg-white/10 border-white/20'
                  }`}>
                    {sourceLabel}
                  </span>

                  {isFullAudio ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-mood-lime bg-white/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      Full Track
                    </span>
                  ) : hasAudio ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-mood-mustard bg-white/10 px-2.5 py-0.5 rounded-full">
                      30-sec Preview
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                      Preview Unavailable
                    </span>
                  )}
                  {currentSong.language && (
                    <span className="text-[10px] font-semibold text-white/80 bg-white/10 px-2.5 py-0.5 rounded-full">
                      {currentSong.language}
                    </span>
                  )}
                  {currentSong.genre && (
                    <span className="text-[10px] font-semibold text-white/60 bg-white/5 px-2 py-0.5 rounded-full">
                      {currentSong.genre}
                    </span>
                  )}
                </div>

                {/* Error Banner in Expanded View */}
                {error && (
                  <div className="flex items-center gap-2 mt-3 p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="flex-1">{error}</span>
                    {currentSong.externalUrl && (
                      <a
                        href={currentSong.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-full font-bold text-xs transition-colors shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" /> Web
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleFeedback('like')}
                  className={`p-3 rounded-full transition-all hover:scale-110 ${
                    currentFeedback === 'like' ? 'bg-mood-cobalt text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-white/80'
                  }`}
                  title={currentFeedback === 'like' ? 'Liked track' : 'Like track (boosts future recommendations)'}
                >
                  <ThumbsUp className={`w-5 h-5 ${currentFeedback === 'like' ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('dislike')}
                  className={`p-3 rounded-full transition-all hover:scale-110 ${
                    currentFeedback === 'dislike' ? 'bg-rose-600 text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-white/80'
                  }`}
                  title={currentFeedback === 'dislike' ? 'Disliked track' : 'Dislike track (deprioritizes in recommendations)'}
                >
                  <ThumbsDown className={`w-5 h-5 ${currentFeedback === 'dislike' ? 'fill-current' : ''}`} />
                </button>
                {toggleFavorite && (
                  <button 
                    onClick={(e) => toggleFavorite(currentSong, e)}
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110"
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    <Heart className={`w-6 h-6 ${isFav ? 'fill-mood-mustard text-mood-mustard' : 'text-white'}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Seek Bar */}
            <div className="w-full space-y-2 mb-6">
              <div 
                className={`w-full h-2 bg-white/20 rounded-full overflow-hidden relative ${hasAudio ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                onClick={handleSeek}
              >
                <div 
                  className="h-full bg-mood-lime rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/60 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Big Controls */}
            <div className="flex items-center justify-center gap-8 md:gap-10 w-full mb-8">
              <button 
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-3 rounded-full transition-colors ${
                  isShuffle ? 'text-mood-lime bg-white/20' : 'text-white/50 hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button 
                onClick={handlePrevious}
                disabled={!activeList || activeList.length === 0}
                className="text-white hover:text-mood-lime transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <SkipBack className="w-8 h-8 fill-current" />
              </button>

              {/* Big Play Button - STRICT TRUTHFUL STATE */}
              <button 
                onClick={togglePlay}
                className="w-20 h-20 rounded-full bg-mood-lime text-mood-forest flex items-center justify-center hover:scale-105 active:scale-95 shadow-2xl transition-all"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isLoading ? (
                  <div className="w-8 h-8 border-4 border-mood-forest/30 border-t-mood-forest rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-9 h-9 fill-current" />
                ) : (
                  <Play className="w-9 h-9 fill-current ml-1" />
                )}
              </button>

              <button 
                onClick={handleNext}
                disabled={!activeList || activeList.length === 0}
                className="text-white hover:text-mood-lime transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <SkipForward className="w-8 h-8 fill-current" />
              </button>

              <button 
                onClick={cycleRepeatMode}
                className={`p-3 rounded-full transition-colors ${
                  repeatMode !== 'off' ? 'text-mood-lime bg-white/20' : 'text-white/50 hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-4 w-full max-w-xs">
              <button onClick={() => setIsMuted(!isMuted)} className="text-white/60 hover:text-white transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div 
                className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-2 transition-all"
                onClick={handleVolumeChange}
              >
                <div 
                  className="h-full bg-white rounded-full"
                  style={{ width: `${volumePercent}%` }}
                />
              </div>
            </div>

          </div>

          {/* Bottom Bar: Minimize hint */}
          <div className="text-center max-w-4xl mx-auto w-full pt-4">
            <button 
              onClick={() => setIsExpanded(false)}
              className="text-xs text-white/50 hover:text-white transition-colors uppercase tracking-widest font-semibold flex items-center justify-center gap-1 mx-auto"
            >
              <Minimize2 className="w-3.5 h-3.5" /> Collapse Player
            </button>
          </div>

        </div>
      )}
    </>
  );
};

export default Player;
