import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Play,
  Pause,
  Heart,
  Plus,
  Trash2,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Music,
  Headphones,
  Check,
  AlertCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  RotateCcw,
  Languages,
  AlertTriangle
} from 'lucide-react';
import * as api from '../services/api.js';
import SongCover from '../components/SongCover';

const CompanionChat = ({
  user,
  currentSong,
  setCurrentSong,
  queue = [],
  setQueue,
  favorites = new Set(),
  toggleFavorite,
  onOpenAddToPlaylist,
  lastFinishedSong
}) => {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [postSongVibePrompt, setPostSongVibePrompt] = useState(null);

  // Voice Input (Speech-To-Text) & Voice Responses (Text-To-Speech) states
  const [voiceStatus, setVoiceStatus] = useState('ready'); // 'ready' | 'listening' | 'processing' | 'recognition-failed' | 'permission-denied' | 'unsupported'
  const [voiceLanguage, setVoiceLanguage] = useState(() => {
    return localStorage.getItem('moodify_voice_lang') || 'en-IN';
  });
  const [voiceError, setVoiceError] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [readRepliesAloud, setReadRepliesAloud] = useState(() => {
    return localStorage.getItem('moodify_tts_enabled') === 'true';
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Scroll to bottom of message thread
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat sessions on mount
  useEffect(() => {
    loadSessions();
  }, [user]);

  // Check speech recognition capability on mount
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (!SpeechRecognition) {
      setVoiceStatus('unsupported');
    }
  }, []);

  // Load speech synthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        setVoices(v);
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Cleanup active audio/speech/recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Watch for song finish notifications for post-song interactions
  useEffect(() => {
    if (lastFinishedSong && lastFinishedSong.title) {
      setPostSongVibePrompt({
        song: lastFinishedSong,
        title: lastFinishedSong.title,
        artist: lastFinishedSong.artist
      });
    }
  }, [lastFinishedSong]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await api.getChatSessions();
      setSessions(data);
      if (data.length > 0) {
        selectSession(data[0]._id);
      } else {
        await handleNewSession();
      }
    } catch (err) {
      console.warn('Failed to load chat sessions:', err.message);
    } finally {
      setLoadingSessions(false);
    }
  };

  const selectSession = async (sessionId) => {
    try {
      stopSpeaking();
      setActiveSessionId(sessionId);
      const session = await api.getChatSession(sessionId);
      setMessages(session.messages || []);
      setShowSessionsDrawer(false);
    } catch (err) {
      console.warn('Failed to load session details:', err.message);
    }
  };

  const handleNewSession = async () => {
    try {
      stopSpeaking();
      const newSession = await api.createChatSession('New Music Chat');
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession._id);
      setMessages(newSession.messages || []);
      setShowSessionsDrawer(false);
    } catch (err) {
      console.warn('Failed to create new chat session:', err.message);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      stopSpeaking();
      await api.deleteChatSession(sessionId);
      const remaining = sessions.filter(s => s._id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          selectSession(remaining[0]._id);
        } else {
          handleNewSession();
        }
      }
    } catch (err) {
      console.warn('Failed to delete session:', err.message);
    }
  };

  // Text-To-Speech (TTS) response speech handler
  const cleanMarkdownForSpeech = (text = '') => {
    return text
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const speakReply = (rawText) => {
    if (!readRepliesAloud || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const textToSpeak = cleanMarkdownForSpeech(rawText);
    if (!textToSpeak) return;

    try {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      currentUtteranceRef.current = utterance;

      const hasDevanagari = /[\u0900-\u097F]/.test(textToSpeak);
      const isHinglish = /\b(gaane|gaana|aapke|sukoon|shaant|shuru|baja|sunao|kuch|hai|hain|hoon)\b/i.test(textToSpeak);

      if (voices.length > 0) {
        let bestVoice = null;
        if (hasDevanagari) {
          bestVoice = voices.find(v => v.lang.startsWith('hi')) || voices.find(v => v.lang.includes('IN'));
        } else if (isHinglish) {
          bestVoice = voices.find(v => v.lang === 'en-IN') || voices.find(v => v.lang.startsWith('hi')) || voices.find(v => v.lang.includes('IN'));
        }
        if (!bestVoice) {
          bestVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
        if (bestVoice) {
          utterance.voice = bestVoice;
        }
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      utterance.onerror = (e) => {
        console.warn('Speech synthesis error:', e);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis failed:', err.message);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    currentUtteranceRef.current = null;
  };

  // Speech-To-Text (STT) handlers
  const handleToggleVoice = () => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      setVoiceStatus('unsupported');
      setVoiceError('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari, or type your message.');
      return;
    }

    if (voiceStatus === 'listening') {
      stopListening();
      return;
    }

    stopSpeaking();
    startListening();
  };

  const startListening = () => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      setVoiceStatus('unsupported');
      return;
    }

    setVoiceError('');
    setInterimTranscript('');
    setVoiceStatus('listening');

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Do not record continuously without user action
      recognition.interimResults = true;
      recognition.lang = voiceLanguage; // 'en-IN' (English & Hinglish) or 'hi-IN' (Hindi)
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setVoiceStatus('listening');
        setVoiceError('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const transcript = item[0].transcript;
          if (item.isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final.trim()) {
          setInterimTranscript('');
          const trimmedFinal = final.trim();
          setInputMessage(prev => {
            const base = prev.trim();
            return base ? `${base} ${trimmedFinal}` : trimmedFinal;
          });
          setVoiceStatus('processing');
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setInterimTranscript('');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceStatus('permission-denied');
          setVoiceError('Microphone access was denied. Please allow microphone permissions in your browser address bar.');
        } else if (event.error === 'no-speech') {
          setVoiceStatus('recognition-failed');
          setVoiceError('No speech was detected. Tap Retry or click the microphone to speak again.');
        } else if (event.error === 'network') {
          setVoiceStatus('recognition-failed');
          setVoiceError('Network connection issue during speech recognition. Please retry.');
        } else {
          setVoiceStatus('recognition-failed');
          setVoiceError(`Voice recognition error (${event.error}). Tap Retry to try again.`);
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        setVoiceStatus(prev => {
          if (prev === 'listening' || prev === 'processing') {
            return 'ready';
          }
          return prev;
        });
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setVoiceStatus('recognition-failed');
      setVoiceError('Microphone could not be started. Tap Retry to try again.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        try { recognitionRef.current.abort(); } catch (err) {}
      }
    }
    setInterimTranscript('');
    setVoiceStatus('ready');
  };

  const handleToggleTts = () => {
    const next = !readRepliesAloud;
    setReadRepliesAloud(next);
    localStorage.setItem('moodify_tts_enabled', String(next));
    if (!next) {
      stopSpeaking();
    }
  };

  const handleLanguageChange = (lang) => {
    setVoiceLanguage(lang);
    localStorage.setItem('moodify_voice_lang', lang);
    if (voiceStatus === 'listening') {
      stopListening();
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || loading || !activeSessionId) return;

    // Interrupt any ongoing speech playback or active microphone
    stopSpeaking();
    if (voiceStatus === 'listening') {
      stopListening();
    }

    setInputMessage('');
    setInterimTranscript('');
    resetPostSongPrompt();

    // Optimistically append user message
    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const clientContext = {
        nowPlaying: currentSong,
        currentQueue: queue,
        favorites: Array.from(favorites || [])
      };
      const res = await api.sendChatMessage(activeSessionId, text, clientContext);
      const assistantMsg = { ...res.message, action: res.action };

      // Update messages with official assistant message
      setMessages(prev => [...prev, assistantMsg]);

      // Handle companion automated or requested actions
      if (res.action) {
        const action = res.action;
        if (action.type === 'PLAY_SONG' && action.song) {
          handlePlaySong(action.song);
        } else if (action.type === 'QUEUE_PLAYLIST' && action.songs && action.songs.length > 0) {
          if (action.autoplay === true) {
            handlePlayAll(action.songs);
          }
        } else if (action.type === 'REPLACE_CURRENT_SONG' && action.song) {
          if (setCurrentSong) {
            setCurrentSong(action.song);
          }
          if (setQueue) {
            setQueue(prev => {
              const currentId = currentSong?._id || currentSong?.id;
              const idx = prev.findIndex(s => (s._id || s.id) === currentId);
              if (idx !== -1) {
                const nextQ = [...prev];
                nextQ[idx] = action.song;
                return nextQ;
              }
              return [action.song, ...prev];
            });
          }
        } else if (action.type === 'PAUSE') {
          window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'PAUSE' } }));
        } else if (action.type === 'RESUME') {
          window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'RESUME' } }));
        } else if (action.type === 'PLAY_NEXT') {
          window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'PLAY_NEXT' } }));
        } else if (action.type === 'PLAY_PREVIOUS') {
          window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'PLAY_PREVIOUS' } }));
        } else if (action.type === 'TOGGLE_SHUFFLE') {
          window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'TOGGLE_SHUFFLE' } }));
        } else if ((action.type === 'FAVORITE_UPDATED' || action.type === 'FAVORITE_SONG' || action.type === 'REMOVE_FAVORITE') && action.song && toggleFavorite) {
          const s = action.song;
          const sId = s._id || s.id;
          const isCurrentlyFav = favorites.has(sId) || favorites.has(String(sId));
          if (action.isFavorite && !isCurrentlyFav) {
            toggleFavorite(s);
          } else if (!action.isFavorite && isCurrentlyFav) {
            toggleFavorite(s);
          }
        } else if (action.type === 'PLAYLIST_SAVED' || action.type === 'SONG_ADDED_TO_PLAYLIST') {
          window.dispatchEvent(new CustomEvent('moodify:playlists-changed'));
        }
      }

      // If TTS enabled, speak reply aloud
      if (assistantMsg && assistantMsg.text) {
        speakReply(assistantMsg.text);
      }

      // Update session title in list if changed
      if (res.session && res.session.title) {
        setSessions(prev => prev.map(s =>
          s._id === activeSessionId ? { ...s, title: res.session.title } : s
        ));
      }
    } catch (err) {
      const errorMsg = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: "I encountered an issue retrieving recommendations. Please try again or ask for a different mood.",
        quickReplies: ['Calm and relaxing', 'Emotional Bollywood', 'Uplifting music'],
        recommendations: [],
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = (songs) => {
    if (!songs || songs.length === 0) return;
    stopSpeaking();
    if (setQueue) {
      setQueue(songs);
    }
    if (setCurrentSong) {
      setCurrentSong(songs[0]);
    }
  };

  const handlePlaySong = (song) => {
    if (!song) return;
    // Interrupt voice playback if user plays a track
    stopSpeaking();

    const currentId = currentSong?._id || currentSong?.id;
    const songId = song._id || song.id;

    if (currentId === songId) {
      window.dispatchEvent(new CustomEvent('moodify:player-control', { detail: { command: 'TOGGLE_PLAY' } }));
      return;
    }

    setCurrentSong(song);
    if (setQueue) {
      setQueue(prev => {
        const exists = prev.some(s => (s._id || s.id) === songId);
        return exists ? prev : [song, ...prev];
      });
    }
  };

  const resetPostSongPrompt = () => {
    setPostSongVibePrompt(null);
  };

  const isCurrentSongPlaying = (song) => {
    if (!currentSong || !song) return false;
    const cId = String(currentSong._id || currentSong.id);
    const sId = String(song._id || song.id);
    return cId === sId;
  };

  return (
    <div className={`h-full w-full flex flex-col md:flex-row relative bg-mood-offwhite overflow-hidden min-h-0 ${currentSong ? 'pb-24' : 'pb-0'}`}>
      {/* SESSIONS SIDEBAR / DRAWER */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-mood-black/10 flex flex-col transition-transform duration-300 md:static md:translate-x-0 h-full min-h-0 shrink-0
        ${showSessionsDrawer ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${currentSong ? 'pb-24 md:pb-0' : 'pb-0'}
      `}>
        {/* Drawer Header */}
        <div className="p-4 border-b border-mood-black/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-mood-cobalt/10 text-mood-cobalt rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-mood-forest">Chat History</h3>
              <p className="text-xs text-mood-black/50">Your music companions</p>
            </div>
          </div>
          <button
            onClick={handleNewSession}
            title="Start new conversation"
            className="p-2 text-mood-cobalt hover:bg-mood-cobalt/10 rounded-xl transition-colors cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1.5">
          {loadingSessions ? (
            <div className="p-4 text-center text-xs text-mood-black/40">Loading conversations...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-mood-black/40">No conversations yet.</div>
          ) : (
            sessions.map(s => {
              const isActive = s._id === activeSessionId;
              return (
                <div
                  key={s._id}
                  onClick={() => selectSession(s._id)}
                  className={`
                    group flex items-center justify-between p-3 rounded-2xl cursor-pointer text-sm transition-all
                    ${isActive
                      ? 'bg-mood-cobalt text-white font-semibold shadow-md shadow-mood-cobalt/20'
                      : 'hover:bg-mood-black/5 text-mood-black/80'}
                  `}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-mood-black/40'}`} />
                    <span className="truncate">{s.title || 'Music Chat'}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s._id)}
                    title="Delete conversation"
                    className={`
                      opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-opacity
                      ${isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-mood-sad/10 text-mood-sad'}
                    `}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* User Info Footer in Drawer */}
        <div className="p-4 border-t border-mood-black/5 bg-mood-offwhite/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-mood-forest text-white text-xs font-bold flex items-center justify-center">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <span className="text-xs font-medium text-mood-forest truncate">{user?.name || user?.email}</span>
          </div>
        </div>
      </div>

      {/* OVERLAY FOR MOBILE DRAWER */}
      {showSessionsDrawer && (
        <div
          onClick={() => setShowSessionsDrawer(false)}
          className="fixed inset-0 bg-mood-black/30 z-20 md:hidden backdrop-blur-sm"
        />
      )}

      {/* MAIN CHAT CONVERSATION AREA */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-b from-mood-offwhite via-white to-mood-offwhite">
        {/* Top Chat Bar */}
        <div className="px-6 py-3.5 border-b border-mood-black/5 flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSessionsDrawer(true)}
              className="p-2 md:hidden text-mood-forest hover:bg-mood-black/5 rounded-xl transition-colors cursor-pointer"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-mood-cobalt to-mood-forest text-white flex items-center justify-center shadow-md shadow-mood-cobalt/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-mood-forest flex items-center gap-2">
                  Moodify AI Companion
                  <span className="bg-emerald-500/10 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-500/20">
                    Live
                  </span>
                </h2>
                <p className="text-xs text-mood-black/50">Multilingual music discovery & companion</p>
              </div>
            </div>
          </div>

          {/* Right Toolbar Controls: Voice Output (TTS) & New Chat */}
          <div className="flex items-center gap-2">
            {/* Speaking indicator and Stop Speaking button */}
            {isSpeaking && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-mood-cobalt/10 text-mood-cobalt rounded-xl text-xs font-semibold animate-pulse border border-mood-cobalt/20">
                <Volume2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Speaking</span>
                <button
                  type="button"
                  onClick={stopSpeaking}
                  title="Stop speaking"
                  className="ml-1 p-0.5 hover:bg-mood-cobalt/20 rounded text-mood-cobalt"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </div>
            )}

            {/* Read Replies Aloud Toggle */}
            <button
              type="button"
              onClick={handleToggleTts}
              title={readRepliesAloud ? "Voice responses ON (Read replies aloud)" : "Voice responses OFF"}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border
                ${readRepliesAloud
                  ? 'bg-mood-cobalt text-white border-mood-cobalt shadow-sm shadow-mood-cobalt/20'
                  : 'bg-white text-mood-black/70 border-mood-black/10 hover:bg-mood-black/5'}
              `}
            >
              {readRepliesAloud ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-mood-black/40" />}
              <span className="hidden md:inline">{readRepliesAloud ? 'Voice On' : 'Voice Off'}</span>
            </button>

            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-mood-cobalt bg-mood-cobalt/10 hover:bg-mood-cobalt/15 rounded-xl transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>

        {/* POST-SONG VIBE INTERACTION CHIP */}
        {postSongVibePrompt && (
          <div className="mx-6 mt-3 bg-gradient-to-r from-mood-cobalt/10 to-mood-forest/10 border border-mood-cobalt/20 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2 text-xs text-mood-forest font-semibold">
              <Headphones className="w-4 h-4 text-mood-cobalt animate-pulse" />
              <span>Finished: <strong>{postSongVibePrompt.title}</strong> by {postSongVibePrompt.artist}. What's next?</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => handleSendMessage('Keep this vibe')}
                className="px-2.5 py-1 text-xs font-bold bg-white text-mood-forest hover:bg-mood-cobalt hover:text-white rounded-lg border border-mood-black/5 transition-all shadow-sm"
              >
                Keep this vibe
              </button>
              <button
                onClick={() => handleSendMessage('Suggest something calmer')}
                className="px-2.5 py-1 text-xs font-bold bg-white text-mood-forest hover:bg-mood-cobalt hover:text-white rounded-lg border border-mood-black/5 transition-all shadow-sm"
              >
                Something calmer
              </button>
              <button
                onClick={() => handleSendMessage('More energetic')}
                className="px-2.5 py-1 text-xs font-bold bg-white text-mood-forest hover:bg-mood-cobalt hover:text-white rounded-lg border border-mood-black/5 transition-all shadow-sm"
              >
                More energetic
              </button>
              <button
                onClick={() => handleSendMessage('Recommend another song')}
                className="px-2.5 py-1 text-xs font-bold bg-white text-mood-forest hover:bg-mood-cobalt hover:text-white rounded-lg border border-mood-black/5 transition-all shadow-sm"
              >
                Another song
              </button>
              <button
                onClick={resetPostSongPrompt}
                className="text-xs text-mood-black/40 hover:text-mood-black ml-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* MESSAGES THREAD */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-8 py-6 space-y-6">
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id || index}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`
                  w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm
                  ${isUser
                    ? 'bg-mood-forest text-white'
                    : 'bg-gradient-to-tr from-mood-cobalt to-mood-forest text-white'}
                `}>
                  {isUser ? (user?.name ? user.name[0].toUpperCase() : 'U') : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Message Bubble Container */}
                <div className={`space-y-3.5 max-w-[85%] sm:max-w-[75%]`}>
                  <div className={`
                    p-4 rounded-3xl text-sm leading-relaxed shadow-sm relative group
                    ${isUser
                      ? 'bg-mood-forest text-white rounded-tr-sm font-medium'
                      : 'bg-white border border-mood-black/10 text-mood-forest rounded-tl-sm'}
                  `}>
                    {msg.text}

                    {/* Manual Read Aloud action on assistant message */}
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => speakReply(msg.text)}
                        title="Read this message aloud"
                        className="opacity-0 group-hover:opacity-100 absolute bottom-2 right-2 p-1 text-mood-black/30 hover:text-mood-cobalt rounded-lg transition-opacity"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* INTERACTIVE PLAYLIST CARDS */}
                  {msg.action?.type === 'PLAYLISTS_LISTED' && Array.isArray(msg.action?.playlists) && msg.action.playlists.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs text-mood-black/60 font-semibold px-1">
                        <span>{msg.action.playlists.length} saved playlists</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {msg.action.playlists.map((pl, plIdx) => (
                          <div
                            key={pl._id || plIdx}
                            onClick={() => handleSendMessage(`Play ${pl.name} playlist`)}
                            className="bg-white border border-mood-black/10 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs hover:shadow-md hover:border-mood-cobalt/40 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-mood-cobalt/20 to-mood-forest/20 flex items-center justify-center text-mood-cobalt font-bold shrink-0">
                                <Music className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-mood-forest truncate group-hover:text-mood-cobalt">
                                  {pl.name}
                                </p>
                                <p className="text-[11px] text-mood-black/50">
                                  {pl.songs ? pl.songs.length : 0} tracks
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="w-8 h-8 rounded-full bg-mood-cobalt text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0"
                              title={`Play ${pl.name}`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RECOMMENDATION SONG CARDS */}
                  {msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {msg.recommendations.length > 1 && (
                        <div className="flex items-center justify-between px-1 text-xs text-mood-black/60 font-semibold">
                          <span>{msg.recommendations.length} curated tracks</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePlayAll(msg.recommendations)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-mood-cobalt text-white rounded-lg hover:bg-mood-cobalt/90 shadow-sm transition-all text-[11px] font-bold"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Play All</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendMessage('Save this playlist')}
                              className="flex items-center gap-1 px-2.5 py-1 bg-white text-mood-forest border border-mood-black/10 rounded-lg hover:bg-mood-black/5 shadow-sm transition-all text-[11px] font-bold"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Save Playlist</span>
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {msg.recommendations.map((song, sIdx) => {
                          const songId = song._id || song.id;
                          const isPlaying = isCurrentSongPlaying(song);
                          const isFav = favorites.has(songId);

                          return (
                            <div
                              key={songId || sIdx}
                              className="bg-white border border-mood-black/10 rounded-2xl p-3 flex gap-3 shadow-md hover:shadow-lg transition-all group"
                            >
                              {/* Artwork & Play button */}
                              <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-mood-black/5">
                                <SongCover
                                  src={song.cover || song.albumArt}
                                  title={song.title}
                                  artist={song.artist}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <button
                                  onClick={() => handlePlaySong(song)}
                                  title={isPlaying ? 'Pause' : 'Play now'}
                                  className={`
                                    absolute inset-0 m-auto w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md
                                    ${isPlaying
                                      ? 'bg-mood-cobalt text-white scale-100 opacity-100'
                                      : 'bg-mood-black/70 hover:bg-mood-cobalt text-white opacity-85 hover:scale-110'}
                                  `}
                                >
                                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                                </button>
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <h4 className="font-bold text-xs text-mood-forest truncate" title={song.title}>
                                      {song.title}
                                    </h4>
                                  </div>
                                  <p className="text-[11px] text-mood-black/60 truncate" title={song.artist}>
                                    {song.artist}
                                  </p>
                                </div>

                                {/* Badges & Actions */}
                                <div className="flex items-center justify-between pt-1">
                                  <span className={`
                                    text-[9px] font-bold px-2 py-0.5 rounded-full border
                                    ${song.previewLabel === 'Full Track'
                                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                      : 'bg-mood-cobalt/10 text-mood-cobalt border-mood-cobalt/20'}
                                  `}>
                                    {song.previewLabel || (song.duration > 100 ? 'Full Track' : '30s Preview')}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    {/* Favorite Button */}
                                    <button
                                      onClick={(e) => toggleFavorite(song, e)}
                                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                      className={`
                                        p-1.5 rounded-lg transition-colors
                                        ${isFav ? 'text-mood-sad bg-mood-sad/10' : 'text-mood-black/40 hover:text-mood-sad hover:bg-mood-sad/5'}
                                      `}
                                    >
                                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                                    </button>

                                    {/* Add to Playlist Button */}
                                    {onOpenAddToPlaylist && (
                                      <button
                                        onClick={() => onOpenAddToPlaylist(song)}
                                        title="Add to playlist"
                                        className="p-1.5 text-mood-black/40 hover:text-mood-cobalt hover:bg-mood-cobalt/10 rounded-lg transition-colors"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* QUICK REPLIES PILLS */}
                  {!isUser && msg.quickReplies && msg.quickReplies.length > 0 && index === messages.length - 1 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.quickReplies.map((reply, rIdx) => (
                        <button
                          key={rIdx}
                          onClick={() => handleSendMessage(reply)}
                          disabled={loading}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white hover:bg-mood-cobalt hover:text-white text-mood-forest border border-mood-black/10 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading bubble */}
          {loading && (
            <div className="flex gap-3 max-w-xl">
              <div className="w-8 h-8 rounded-xl bg-mood-cobalt text-white flex items-center justify-center flex-shrink-0 text-xs shadow-sm">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white border border-mood-black/10 p-4 rounded-3xl rounded-tl-sm text-sm text-mood-black/60 flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-mood-cobalt animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-mood-cobalt animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-mood-cobalt animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs font-medium ml-1">Selecting the best tracks...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* CHAT INPUT BAR WITH MULTILINGUAL VOICE CAPABILITIES */}
        <div className="shrink-0 p-3 md:p-4 bg-white/95 backdrop-blur-md border-t border-mood-black/10 shadow-sm">
          {/* Active Listening / Interim speech preview */}
          {voiceStatus === 'listening' && (
            <div className="max-w-3xl mx-auto mb-2 px-3.5 py-2 bg-gradient-to-r from-red-500/10 via-rose-500/10 to-mood-cobalt/10 border border-red-500/25 rounded-2xl flex items-center justify-between gap-3 text-xs text-red-700 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping flex-shrink-0" />
                <span className="font-semibold flex-shrink-0">
                  Listening ({voiceLanguage === 'en-IN' ? 'English / Hinglish' : 'हिन्दी'})...
                </span>
                {interimTranscript && (
                  <span className="text-mood-forest italic truncate font-medium">
                    "{interimTranscript}"
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={stopListening}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] transition-colors flex-shrink-0 shadow-sm"
              >
                Stop Recording
              </button>
            </div>
          )}

          {/* Processing speech feedback */}
          {voiceStatus === 'processing' && (
            <div className="max-w-3xl mx-auto mb-2 px-3.5 py-1.5 bg-mood-cobalt/10 border border-mood-cobalt/20 rounded-xl flex items-center gap-2 text-xs text-mood-cobalt shadow-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Transcribing speech into message...</span>
            </div>
          )}

          {/* Voice Error States (Recognition failed or Permission denied) with Retry */}
          {(voiceStatus === 'recognition-failed' || voiceStatus === 'permission-denied') && (
            <div className="max-w-3xl mx-auto mb-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-2 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="truncate">{voiceError || 'Speech recognition failed.'}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={startListening}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-[11px] transition-colors flex items-center gap-1 shadow-sm"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => { setVoiceStatus('ready'); setVoiceError(''); }}
                  className="text-amber-800 hover:text-amber-950 px-1 py-0.5 rounded"
                  title="Dismiss message"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Unsupported Browser Banner */}
          {voiceStatus === 'unsupported' && voiceError && (
            <div className="max-w-3xl mx-auto mb-2 px-3.5 py-1.5 bg-mood-black/5 border border-mood-black/10 rounded-xl flex items-center justify-between gap-2 text-xs text-mood-black/70">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-mood-black/50 flex-shrink-0" />
                <span>{voiceError}</span>
              </div>
              <button
                type="button"
                onClick={() => setVoiceError('')}
                className="text-mood-black/50 hover:text-mood-black px-1"
              >
                ✕
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 max-w-3xl mx-auto bg-mood-black/5 rounded-2xl p-1.5 border border-mood-black/5 focus-within:border-mood-cobalt/40 focus-within:ring-2 focus-within:ring-mood-cobalt/10 focus-within:bg-white transition-all shadow-inner"
          >
            {/* Language Switcher Pill for Speech Recognition */}
            <div className="flex items-center border-r border-mood-black/10 pr-1 pl-1">
              <button
                type="button"
                onClick={() => handleLanguageChange(voiceLanguage === 'en-IN' ? 'hi-IN' : 'en-IN')}
                title={`Speech Language: ${voiceLanguage === 'en-IN' ? 'English & Hinglish (Click to switch to Hindi)' : 'Hindi (Click to switch to English/Hinglish)'}`}
                className="px-2 py-1 text-[11px] font-bold text-mood-forest hover:bg-mood-black/5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Languages className="w-3.5 h-3.5 text-mood-cobalt" />
                <span>{voiceLanguage === 'en-IN' ? 'EN / Hinglish' : 'हिन्दी'}</span>
              </button>
            </div>

            <input
              type="text"
              placeholder={
                voiceStatus === 'listening'
                  ? "Listening... Speak in English, Hindi, or Hinglish..."
                  : "Ask for music, explain your mood, or tap the mic to speak..."
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={loading}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm focus:outline-none text-mood-forest placeholder:text-mood-black/40"
            />

            {/* Microphone Button (Speech-to-Text) */}
            <button
              type="button"
              onClick={handleToggleVoice}
              title={
                voiceStatus === 'listening'
                  ? 'Listening... Click to stop recording'
                  : voiceStatus === 'permission-denied'
                  ? 'Microphone permission denied (Click to retry)'
                  : voiceStatus === 'recognition-failed'
                  ? 'Recognition failed (Click to retry)'
                  : `Click to speak (${voiceLanguage === 'en-IN' ? 'English & Hinglish' : 'Hindi'})`
              }
              className={`
                w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 relative
                ${voiceStatus === 'listening'
                  ? 'bg-red-500 text-white shadow-md shadow-red-500/30 animate-pulse'
                  : voiceStatus === 'recognition-failed'
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20'
                  : voiceStatus === 'permission-denied'
                  ? 'bg-red-500/10 text-red-600 border border-red-500/30 hover:bg-red-500/20'
                  : 'bg-mood-cobalt/10 text-mood-cobalt hover:bg-mood-cobalt/20'}
              `}
            >
              {voiceStatus === 'listening' ? (
                <span className="relative flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-ping" />
                </span>
              ) : voiceStatus === 'recognition-failed' ? (
                <RotateCcw className="w-4 h-4" />
              ) : voiceStatus === 'permission-denied' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Send Message Button */}
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="w-10 h-10 rounded-xl bg-mood-cobalt text-white flex items-center justify-center hover:bg-mood-cobalt/90 disabled:opacity-40 transition-all flex-shrink-0 shadow-md shadow-mood-cobalt/20"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="text-[11px] text-center text-mood-black/40 mt-2 flex items-center justify-center gap-2 flex-wrap">
            <span>Voice input supports English, Hindi & Hinglish.</span>
            <span>•</span>
            <span>Audio speech recognition may vary with ambient noise and phrasing.</span>
            <span>•</span>
            <span>Verified catalog & Apple Music previews.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanionChat;
