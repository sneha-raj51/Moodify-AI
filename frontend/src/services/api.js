import { songs as mockSongs } from '../utils/mockData.js';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

export const getGuestSessionId = () => {
  try {
    let sessionId = localStorage.getItem('moodify_guest_session_id');
    if (!sessionId) {
      sessionId = 'guest_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('moodify_guest_session_id', sessionId);
    }
    return sessionId;
  } catch (e) {
    return 'guest_ephemeral_' + Date.now();
  }
};

export const getGuestHistory = () => {
  try {
    const raw = localStorage.getItem('moodify_listening_history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const appendGuestHistory = (entry) => {
  try {
    const list = getGuestHistory();
    const entryId = entry._id || entry.id;
    const exists = list.some(item => (entryId && (item._id === entryId || item.id === entryId)));
    if (!exists) {
      const updated = [entry, ...list].slice(0, 100);
      localStorage.setItem('moodify_listening_history', JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error saving guest history locally:', e);
  }
};

export const updateGuestHistory = (id, updateData) => {
  try {
    const list = getGuestHistory();
    const idx = list.findIndex(item => item._id === id || item.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updateData };
      localStorage.setItem('moodify_listening_history', JSON.stringify(list));
    }
  } catch (e) {
    console.warn('Error updating guest history locally:', e);
  }
};

export const getAuthHeaders = () => {
  const userInfo = localStorage.getItem('userInfo');
  const headers = {
    'Content-Type': 'application/json',
    'x-session-id': getGuestSessionId()
  };

  if (userInfo) {
    try {
      const { token } = JSON.parse(userInfo);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Error parsing auth token:', e);
    }
  }
  return headers;
};

export const registerUser = async (name, email, password) => {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Registration failed');
  return data;
};

export const loginUser = async (email, password) => {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  return data;
};

export const getSongs = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/songs`);
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    return data.length > 0 ? data : mockSongs;
  } catch (error) {
    console.warn('Backend unavailable, falling back to mock songs:', error);
    return mockSongs;
  }
};

export const getFavorites = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Network response was not ok');
    return await res.json();
  } catch (error) {
    console.warn('Backend unavailable for favorites:', error);
    return [];
  }
};

export const addFavorite = async (songId, externalData = null) => {
  try {
    const res = await fetch(`${API_BASE_URL}/favorites`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ songId, externalData })
    });
    if (!res.ok) throw new Error('Failed to add favorite');
    return await res.json();
  } catch (error) {
    console.warn('Backend unavailable, adding local favorite fallback.');
    throw error;
  }
};

export const removeFavorite = async (favoriteId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/favorites/${favoriteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to remove favorite');
    return await res.json();
  } catch (error) {
    console.warn('Backend unavailable, removing local favorite fallback.');
    throw error;
  }
};

export const getMoods = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/moods`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Network response was not ok');
    return await res.json();
  } catch (error) {
    console.warn('Backend unavailable for moods:', error);
    return [];
  }
};

export const addMood = async (mood, source = 'manual', note = '') => {
  try {
    const res = await fetch(`${API_BASE_URL}/moods`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ mood, source, note })
    });
    if (!res.ok) throw new Error('Failed to add mood');
    return await res.json();
  } catch (error) {
    console.warn('Backend unavailable, adding local mood fallback.');
    throw error;
  }
};

export const addMoodJournalEntry = async ({ mood, note, source = 'journal-entry' }) => {
  return await addMood(mood, source, note);
};

export const deleteMoodEntry = async (id) => {
  try {
    const res = await fetch(`${API_BASE_URL}/moods/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete mood entry');
    return await res.json();
  } catch (error) {
    console.warn('Failed to delete mood entry:', error.message);
    throw error;
  }
};

export const clearMoodHistory = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/moods`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to clear mood history');
    return await res.json();
  } catch (error) {
    console.warn('Failed to clear mood history from server:', error);
    localStorage.removeItem('moodify_mood_history');
    return { success: true };
  }
};

export const getMoodJournal = async ({ range = '7d', mood = '', from = '', to = '' } = {}) => {
  try {
    const params = new URLSearchParams();
    if (range) params.append('range', range);
    if (mood) params.append('mood', mood);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    
    let res = await fetch(`${API_BASE_URL}/history/journal?${params.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      res = await fetch(`${API_BASE_URL}/moods/analytics?${params.toString()}`, {
        headers: getAuthHeaders()
      });
    }
    if (!res.ok) throw new Error('Failed to fetch mood journal');
    return await res.json();
  } catch (error) {
    console.warn('Mood journal fetch error:', error.message);
    return null;
  }
};

export const getAiRecommendations = async (
  mood, 
  favoriteGenres = [], 
  favoriteSongIds = [], 
  recentHistory = [], 
  language = '', 
  favoriteArtists = [],
  listeningMode = null,
  feedbackLikes = [],
  feedbackDislikes = []
) => {
  try {
    const res = await fetch(`${API_BASE_URL}/ai/recommend`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        mood, 
        favoriteGenres, 
        favoriteSongIds, 
        recentHistory, 
        language, 
        favoriteArtists,
        listeningMode,
        feedbackLikes,
        feedbackDislikes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch AI recommendations');
    return data;
  } catch (error) {
    console.warn('AI recommendation error:', error.message);
    throw error;
  }
};

export const getMoodTransitionRecommendations = async (
  startMoodOrOptions, 
  desiredMood = '', 
  stepsCount = 3, 
  favoriteGenres = [], 
  language = '', 
  favoriteSongIds = [],
  listeningMode = null
) => {
  let payload = {};
  if (typeof startMoodOrOptions === 'object' && startMoodOrOptions !== null) {
    payload = startMoodOrOptions;
  } else {
    payload = {
      startMood: startMoodOrOptions,
      desiredMood,
      stepsCount,
      favoriteGenres,
      language,
      favoriteSongIds,
      listeningMode
    };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/ai/recommend/transition`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch transition recommendations');
    return data;
  } catch (error) {
    console.warn('Transition recommendation error:', error.message);
    throw error;
  }
};

export const recordFeedback = async ({ songId, action, title, artist, genre, mood, source, externalId }) => {
  try {
    const res = await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ songId, action, title, artist, genre, mood, source, externalId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to record feedback');
    return data;
  } catch (error) {
    console.warn('Feedback recording error:', error.message);
    throw error;
  }
};

export const getFeedback = async (action = '') => {
  try {
    const url = action ? `${API_BASE_URL}/feedback?action=${encodeURIComponent(action)}` : `${API_BASE_URL}/feedback`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch feedback');
    return await res.json();
  } catch (error) {
    console.warn('Feedback fetch error:', error.message);
    return [];
  }
};

export const getFeedbackSummary = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/feedback/summary`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch feedback summary');
    return await res.json();
  } catch (error) {
    console.warn('Feedback summary fetch error:', error.message);
    return { likes: 0, dislikes: 0, skips: 0, completes: 0, total: 0 };
  }
};

export const deleteFeedback = async (songId, action = '') => {
  try {
    const url = action ? `${API_BASE_URL}/feedback/${encodeURIComponent(songId)}?action=${encodeURIComponent(action)}` : `${API_BASE_URL}/feedback/${encodeURIComponent(songId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete feedback');
    return await res.json();
  } catch (error) {
    console.warn('Feedback deletion error:', error.message);
    throw error;
  }
};

export const logListen = async (songData) => {
  const userInfo = localStorage.getItem('userInfo');
  try {
    const res = await fetch(`${API_BASE_URL}/history`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(songData)
    });
    if (!res.ok) throw new Error('Failed to log listening event');
    const record = await res.json();
    if (!userInfo) {
      appendGuestHistory(record);
    }
    return record;
  } catch (error) {
    console.warn('Backend history log failed, fallback to local:', error.message);
    const localRecord = {
      _id: 'guest_hist_' + Date.now(),
      ...songData,
      createdAt: new Date().toISOString()
    };
    if (!userInfo) {
      appendGuestHistory(localRecord);
    }
    return localRecord;
  }
};

export const getHistory = async () => {
  const userInfo = localStorage.getItem('userInfo');
  try {
    const res = await fetch(`${API_BASE_URL}/history`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch history');
    const serverHistory = await res.json();
    if (!userInfo) {
      const local = getGuestHistory();
      const serverIds = new Set(serverHistory.map(s => String(s._id || s.id)));
      const uniqueLocal = local.filter(l => !serverIds.has(String(l._id || l.id)));
      return [...serverHistory, ...uniqueLocal];
    }
    return serverHistory;
  } catch (error) {
    console.warn('Using local history due to server error:', error.message);
    return getGuestHistory();
  }
};

export const updateListen = async (id, updateData) => {
  const userInfo = localStorage.getItem('userInfo');
  try {
    const res = await fetch(`${API_BASE_URL}/history/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updateData)
    });
    if (!res.ok) throw new Error('Failed to update listening event');
    const record = await res.json();
    if (!userInfo) {
      updateGuestHistory(id, updateData);
    }
    return record;
  } catch (error) {
    if (!userInfo) {
      updateGuestHistory(id, updateData);
    }
  }
};

export const searchSongs = async (query = '', filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (query && query.trim()) params.append('q', query.trim());
    if (filters.mood && filters.mood !== 'All') params.append('mood', filters.mood);
    if (filters.language && filters.language !== 'All') params.append('language', filters.language);
    if (filters.genre && filters.genre !== 'All') params.append('genre', filters.genre);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.page) params.append('page', filters.page);

    const fetchOptions = {};
    if (filters.signal) {
      fetchOptions.signal = filters.signal;
    }

    const res = await fetch(`${API_BASE_URL}/songs/search?${params.toString()}`, fetchOptions);
    if (!res.ok) throw new Error('Search failed');
    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.warn('Backend search error, falling back to local songs:', error);
    const q = (query || '').toLowerCase();
    return mockSongs.filter(s => 
      !q ||
      s.title.toLowerCase().includes(q) || 
      s.artist.toLowerCase().includes(q) || 
      (s.album && s.album.toLowerCase().includes(q))
    );
  }
};

export const getLyrics = async (title, artist, duration = null) => {
  if (!title) return { plain: null, synced: null, lyricsAvailable: false };
  try {
    const params = new URLSearchParams({
      title: title.trim(),
      artist: (artist || '').trim(),
    });
    if (duration) params.append('duration', Math.round(duration).toString());

    const res = await fetch(`${API_BASE_URL}/lyrics?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch lyrics');
    return await res.json();
  } catch (err) {
    console.warn('Lyrics service error:', err.message);
    return { plain: null, synced: null, lyricsAvailable: false, message: 'Lyrics unavailable' };
  }
};

export const resolveYouTube = async (title, artist) => {
  if (!title) return null;
  try {
    const params = new URLSearchParams({
      title: title.trim(),
      artist: (artist || '').trim(),
    });
    const res = await fetch(`${API_BASE_URL}/songs/resolve-youtube?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('YouTube resolve error:', err.message);
    return null;
  }
};

// Playlists API (with guest localStorage fallback if not logged in or backend fails)
const getGuestPlaylists = () => {
  try {
    return JSON.parse(localStorage.getItem('moodify_guest_playlists') || '[]');
  } catch (e) {
    return [];
  }
};

const saveGuestPlaylists = (playlists) => {
  localStorage.setItem('moodify_guest_playlists', JSON.stringify(playlists));
};

export const getPlaylists = async () => {
  const token = localStorage.getItem('userInfo');
  if (!token) return getGuestPlaylists();
  try {
    const res = await fetch(`${API_BASE_URL}/playlists`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch playlists');
    return await res.json();
  } catch (error) {
    console.warn('Using guest playlists due to error:', error);
    return getGuestPlaylists();
  }
};

export const getPlaylist = async (id) => {
  const token = localStorage.getItem('userInfo');
  if (!token || String(id).startsWith('guest_')) {
    const guest = getGuestPlaylists().find(p => p._id === id || p.id === id);
    if (!guest) throw new Error('Playlist not found');
    return guest;
  }
  const res = await fetch(`${API_BASE_URL}/playlists/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch playlist');
  return await res.json();
};

export const createPlaylist = async ({ name, description = '', songs = [] }) => {
  const token = localStorage.getItem('userInfo');
  if (!token) {
    const newPlaylist = {
      _id: `guest_${Date.now()}`,
      name,
      description,
      songs: songs.map(s => ({
        songId: String(s._id || s.id),
        title: s.title,
        artist: s.artist,
        cover: s.cover || s.albumArt,
        audioUrl: s.audioUrl || null,
        duration: s.duration || 30,
        isPlayable: Boolean(s.audioUrl || s.isPlayable),
        genre: s.genre,
        mood: s.mood
      })),
      createdAt: new Date().toISOString()
    };
    const list = [newPlaylist, ...getGuestPlaylists()];
    saveGuestPlaylists(list);
    return newPlaylist;
  }
  const res = await fetch(`${API_BASE_URL}/playlists`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, description, songs })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create playlist');
  return data;
};

export const updatePlaylist = async (id, updateData) => {
  const token = localStorage.getItem('userInfo');
  if (!token || String(id).startsWith('guest_')) {
    const list = getGuestPlaylists();
    const idx = list.findIndex(p => p._id === id || p.id === id);
    if (idx === -1) throw new Error('Playlist not found');
    list[idx] = { ...list[idx], ...updateData };
    saveGuestPlaylists(list);
    return list[idx];
  }
  const res = await fetch(`${API_BASE_URL}/playlists/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updateData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update playlist');
  return data;
};

export const deletePlaylist = async (id) => {
  const token = localStorage.getItem('userInfo');
  if (!token || String(id).startsWith('guest_')) {
    const list = getGuestPlaylists().filter(p => p._id !== id && p.id !== id);
    saveGuestPlaylists(list);
    return { success: true };
  }
  const res = await fetch(`${API_BASE_URL}/playlists/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to delete playlist');
  return data;
};

export const addSongToPlaylist = async (id, song) => {
  const token = localStorage.getItem('userInfo');
  if (!token || String(id).startsWith('guest_')) {
    const list = getGuestPlaylists();
    const idx = list.findIndex(p => p._id === id || p.id === id);
    if (idx === -1) throw new Error('Playlist not found');
    const songEntry = {
      songId: String(song._id || song.id),
      title: song.title,
      artist: song.artist,
      cover: song.cover || song.albumArt,
      audioUrl: song.audioUrl || null,
      duration: song.duration || 30,
      isPlayable: Boolean(song.audioUrl || song.isPlayable),
      genre: song.genre,
      mood: song.mood
    };
    list[idx].songs = list[idx].songs || [];
    list[idx].songs.push(songEntry);
    saveGuestPlaylists(list);
    return list[idx];
  }
  const res = await fetch(`${API_BASE_URL}/playlists/${id}/songs`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(song)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to add song to playlist');
  return data;
};

export const removeSongFromPlaylist = async (id, songId) => {
  const token = localStorage.getItem('userInfo');
  if (!token || String(id).startsWith('guest_')) {
    const list = getGuestPlaylists();
    const idx = list.findIndex(p => p._id === id || p.id === id);
    if (idx === -1) throw new Error('Playlist not found');
    list[idx].songs = (list[idx].songs || []).filter(s => (s.songId || s._id) !== String(songId));
    saveGuestPlaylists(list);
    return list[idx];
  }
  const res = await fetch(`${API_BASE_URL}/playlists/${id}/songs/${songId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to remove song from playlist');
  return data;
};

export const generateSmartPlaylist = async (options = {}) => {
  const res = await fetch(`${API_BASE_URL}/playlists/smart/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(options)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to generate smart playlist');
  return data;
};

export const getListeningRecap = async ({ range = '7d', mode = 'from-listening', from, to } = {}) => {
  const params = new URLSearchParams();
  if (range) params.append('range', range);
  if (mode) params.append('mode', mode);
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  
  const res = await fetch(`${API_BASE_URL}/history/recap?${params.toString()}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to generate recap');
  return data;
};

export const clearHistory = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/history`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to clear history');
    return await res.json();
  } catch (error) {
    console.warn('Failed to clear server history, clearing local:', error);
    localStorage.removeItem('moodify_listening_history');
    return { success: true };
  }
};

export const getJamendoConfig = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/config/jamendo`);
    if (!res.ok) throw new Error('Failed to fetch config');
    return await res.json();
  } catch (error) {
    return { configured: false };
  }
};

export const forgotPassword = async (email) => {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to request password reset');
  return data;
};

export const resetPassword = async (email, token, newPassword) => {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, newPassword })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to reset password');
  return data;
};

export const getUserPreferences = async () => {
  const res = await fetch(`${API_BASE_URL}/auth/preferences`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return await res.json();
};

export const updateUserPreferences = async (preferences) => {
  const res = await fetch(`${API_BASE_URL}/auth/preferences`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(preferences)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update preferences');
  return data;
};

export const getChatSessions = async () => {
  const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to load chat sessions');
  return await res.json();
};

export const createChatSession = async (title = 'New Music Chat') => {
  const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create chat session');
  return data;
};

export const getChatSession = async (id) => {
  const res = await fetch(`${API_BASE_URL}/chat/sessions/${id}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to load chat session');
  return await res.json();
};

export const sendChatMessage = async (sessionId, message, context = {}) => {
  const res = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, context })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to send message');
  return data;
};

export const deleteChatSession = async (id) => {
  const res = await fetch(`${API_BASE_URL}/chat/sessions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to delete chat session');
  return data;
};

export const getTasteProfile = async () => {
  const res = await fetch(`${API_BASE_URL}/profile/taste`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to load taste profile');
  return data;
};

export const updateTasteProfile = async (preferences) => {
  const res = await fetch(`${API_BASE_URL}/profile/taste`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(preferences)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update taste profile');
  return data;
};

export const resetInferredTaste = async () => {
  const res = await fetch(`${API_BASE_URL}/profile/taste/reset-inferred`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to reset inferred taste signals');
  return data;
};

// ================= Feature 8: Recommendation Evaluation Dashboard =================

export const logRecommendationEvent = async ({
  eventId,
  eventType,
  songId,
  title,
  artist,
  genre,
  mood,
  source = 'ai-recommendation',
  metadata = {}
}) => {
  try {
    const res = await fetch(`${API_BASE_URL}/ai/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        eventId,
        eventType,
        songId,
        title,
        artist,
        genre,
        mood,
        source,
        metadata
      })
    });
    if (!res.ok) throw new Error('Failed to log recommendation event');
    return await res.json();
  } catch (error) {
    console.warn('Recommendation event logging error:', error.message);
    return null;
  }
};