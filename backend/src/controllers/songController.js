import mongoose from 'mongoose';
import Song from '../models/Song.js';
import { searchJamendoTracks, searchJamendoByQuery } from '../services/jamendoService.js';
import { searchItunesByQuery, searchItunesTracks } from '../services/itunesService.js';
import { searchAudiusTracks } from '../services/audiusService.js';
import { resolveYouTubeVideo, searchYouTubeTracks } from '../services/youtubeService.js';

let cachedJamendoSongs = null;
let lastCacheTime = 0;
let cachedAudiusSongs = null;
let lastAudiusCacheTime = 0;

const isValidAudioUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;
  if (/\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?.*)?$/i.test(clean)) return false;
  return true;
};

/**
 * Normalizes any track into the standard Moodify song format with accurate provider and playback classification
 */
const normalizeTrack = (track, defaultProvider = 'mongodb') => {
  const id = track._id ? String(track._id) : (track.id ? String(track.id) : '');
  const artwork = track.albumArt || track.cover || track.artwork || track.image || null;
  const candidateAudio = isValidAudioUrl(track.audioUrl) 
    ? track.audioUrl 
    : (isValidAudioUrl(track.previewUrl) ? track.previewUrl : (isValidAudioUrl(track.audio) ? track.audio : null));
  const audio = candidateAudio;
  const hasAudio = Boolean(audio);

  // Provider resolution
  const rawProvider = (track.provider || track.source || defaultProvider || '').toLowerCase();
  const isItunes = rawProvider === 'itunes' || (audio && audio.includes('itunes.apple.com'));
  const isAudius = rawProvider === 'audius' || (audio && (audio.includes('audius.co') || audio.includes('cidstream')));
  const isJamendo = rawProvider === 'jamendo' || (audio && audio.includes('jamendo.com'));

  let provider = 'mongodb';
  if (isItunes) provider = 'itunes';
  else if (isAudius) provider = 'audius';
  else if (isJamendo) provider = 'jamendo';
  else if (rawProvider === 'youtube') provider = 'youtube';

  const isFull = Boolean(
    (track.isFullAudio || track.playbackType === 'full' || isAudius || isJamendo) &&
    hasAudio &&
    !isItunes
  );

  const sourceLabel = isAudius ? 'Audius' : (isJamendo ? 'Jamendo' : (isItunes ? 'iTunes' : 'Moodify'));
  const previewLabel = isFull ? 'Full Track' : (hasAudio ? '30-sec Preview' : 'Preview Unavailable');

  return {
    _id: id,
    id: id,
    title: track.title || track.name || 'Unknown Title',
    artist: track.artist || track.artist_name || 'Unknown Artist',
    album: track.album || track.collectionName || 'Single',
    albumArt: artwork,
    cover: artwork,
    audioUrl: audio,
    previewUrl: audio,
    youtubeId: track.youtubeId || null,
    duration: isFull ? (track.duration || 180) : (hasAudio ? 30 : (track.duration || 30)),
    genre: track.genre || track.primaryGenreName || 'Pop',
    mood: track.mood || (track.moods && track.moods[0]) || 'Neutral',
    moods: track.moods || (track.mood ? [track.mood] : ['Neutral']),
    language: track.language || null,
    isPlayable: hasAudio,
    isPreview: hasAudio && !isFull,
    isFullAudio: isFull,
    playbackType: isFull ? 'full' : (hasAudio ? 'preview' : 'none'),
    provider: isFull ? (track.provider || provider) : (hasAudio ? (track.provider || provider) : 'restricted'),
    source: provider,
    previewLabel,
    sourceLabel,
    license: track.license || null,
    externalUrl: track.externalUrl || (track.youtubeId ? `https://www.youtube.com/watch?v=${track.youtubeId}` : null),
    explanation: track.explanation || (isFull ? `Authorized full-length audio stream via ${sourceLabel}.` : (hasAudio ? 'Verified 30-second official audio preview.' : 'Metadata only (rights restricted).'))
  };
};

/**
 * Enhanced hybrid search supporting:
 * - Query text (title, artist, album)
 * - Language (Hindi, Punjabi, English)
 * - Mood (Happy, Sad, Calm, Energetic, Neutral)
 * - Genre (Bollywood, Pop, Rock, etc.)
 * - Hybrid providers (Local DB, iTunes previews, Audius full-length, Jamendo full-length)
 * - Pagination (limit, page)
 */
export const searchSongs = async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || '').trim();
    const mood = req.query.mood || '';
    const language = req.query.language || '';
    const genre = req.query.genre || '';
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 24));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    // 1. Build MongoDB query
    const dbFilter = {};
    if (query) {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      dbFilter.$or = [
        { title: regex },
        { artist: regex },
        { album: regex },
        { genre: regex }
      ];
    }
    if (mood && mood !== 'All') {
      dbFilter.$or = dbFilter.$or || [];
      const moodCondition = { $or: [{ mood: new RegExp(`^${mood}$`, 'i') }, { moods: new RegExp(`^${mood}$`, 'i') }] };
      if (dbFilter.$or.length > 0) {
        dbFilter.$and = [{ $or: dbFilter.$or }, moodCondition];
        delete dbFilter.$or;
      } else {
        dbFilter.$or = moodCondition.$or;
      }
    }
    if (language && language !== 'All') {
      dbFilter.language = new RegExp(`^${language}$`, 'i');
    }
    if (genre && genre !== 'All') {
      dbFilter.genre = new RegExp(`^${genre}$`, 'i');
    }

    const localSongs = await Song.find(dbFilter)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    // 2. Query iTunes (with Indian & Global store support)
    let itunesTracks = [];
    try {
      if (query) {
        itunesTracks = await searchItunesByQuery(query, limit);
      } else if (mood || language || genre) {
        itunesTracks = await searchItunesTracks(mood || 'Neutral', language || 'Hindi', genre ? [genre] : [], limit);
      }
    } catch (itunesErr) {
      console.warn('External iTunes search unavailable, continuing with local results:', itunesErr.message);
      itunesTracks = [];
    }

    // 3. Query Audius for full-length independent music
    let audiusTracks = [];
    try {
      audiusTracks = await searchAudiusTracks({ query, mood, genre, limit: Math.min(10, limit) });
    } catch (audiusErr) {
      console.warn('Audius search error, continuing without Audius:', audiusErr.message);
      audiusTracks = [];
    }

    // 4. Query Jamendo if configured
    let jamendoTracks = [];
    if (process.env.JAMENDO_CLIENT_ID) {
      try {
        if (query) {
          jamendoTracks = await searchJamendoByQuery(query, Math.min(6, limit));
        } else if (mood || genre) {
          jamendoTracks = await searchJamendoTracks(mood || null, genre ? [genre] : [], 5);
        }
      } catch (jamendoErr) {
        console.warn('Jamendo search error, continuing without Jamendo:', jamendoErr.message);
        jamendoTracks = [];
      }
    }

    // 5. Query YouTube Data API if configured
    let youtubeTracks = [];
    if (query && process.env.YOUTUBE_API_KEY) {
      try {
        youtubeTracks = await searchYouTubeTracks(query, 6);
      } catch (ytErr) {
        console.warn('External YouTube search error:', ytErr.message);
        youtubeTracks = [];
      }
    }

    // 6. Merge results without duplicates
    const seen = new Set();
    const seenIds = new Set();
    const merged = [];

    const normalizeTrackKey = (title = '', artist = '') => {
      const cleanTitle = (title || '')
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
      const cleanArtist = (artist || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
      return {
        cleanTitle,
        key: cleanArtist ? `${cleanTitle}:::${cleanArtist}` : cleanTitle
      };
    };

    const addDeduped = (songList, provider) => {
      for (const raw of songList) {
        const norm = normalizeTrack(raw, provider);
        const { cleanTitle, key } = normalizeTrackKey(norm.title, norm.artist);
        const rawKey = `${norm.title.toLowerCase().trim()}:::${norm.artist.toLowerCase().trim()}`;
        const idKey = String(norm.id || norm._id || '');

        if (!seen.has(key) && !seen.has(rawKey) && (!idKey || !seenIds.has(idKey))) {
          seen.add(key);
          seen.add(rawKey);
          if (cleanTitle) seen.add(cleanTitle);
          if (idKey) seenIds.add(idKey);
          merged.push(norm);
        }
      }
    };

    // Prioritize: Playable local songs -> iTunes previews -> Audius full tracks -> Jamendo full tracks -> YouTube -> other local
    addDeduped(localSongs.filter(s => s.isPlayable || s.youtubeId || s.audioUrl), 'mongodb');
    addDeduped(itunesTracks, 'itunes');
    addDeduped(audiusTracks, 'audius');
    addDeduped(jamendoTracks, 'jamendo');
    addDeduped(youtubeTracks, 'youtube');
    addDeduped(localSongs, 'mongodb');

    res.status(200).json(merged.slice(0, limit));
  } catch (error) {
    console.error('Song Search Error:', error.message);
    res.status(500).json({ message: 'Search Error', error: error.message });
  }
};

/**
 * Resolves a full-length YouTube playback reference for any song
 */
export const resolveYouTube = async (req, res) => {
  try {
    const { title, artist } = req.query;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const videoData = await resolveYouTubeVideo(title, artist);
    res.status(200).json(videoData);
  } catch (err) {
    console.error('YouTube resolve error:', err.message);
    res.status(500).json({ message: 'Failed to resolve YouTube video', error: err.message });
  }
};

export const getSongs = async (req, res) => {
  try {
    const { mood, language, limit = 50 } = req.query;
    const filter = {};
    if (mood && mood !== 'All') {
      filter.$or = [{ mood: new RegExp(`^${mood}$`, 'i') }, { moods: new RegExp(`^${mood}$`, 'i') }];
    }
    if (language && language !== 'All') {
      filter.language = new RegExp(`^${language}$`, 'i');
    }

    const songs = await Song.find(filter).limit(parseInt(limit, 10)).lean();
    
    const now = Date.now();

    // Mix in Jamendo seed tracks if configured
    let jamendoTracks = [];
    if (process.env.JAMENDO_CLIENT_ID) {
      if (!cachedJamendoSongs || now - lastCacheTime > 1000 * 60 * 60) {
        try {
          cachedJamendoSongs = await searchJamendoTracks(mood || null, [], 10);
          lastCacheTime = now;
        } catch (err) {
          console.warn('Failed to fetch Jamendo seed tracks:', err.message);
        }
      }
      jamendoTracks = cachedJamendoSongs || [];
    }

    // Mix in Audius seed tracks
    let audiusTracks = [];
    if (!cachedAudiusSongs || now - lastAudiusCacheTime > 1000 * 60 * 60) {
      try {
        cachedAudiusSongs = await searchAudiusTracks({ mood: mood || null, limit: 10 });
        lastAudiusCacheTime = now;
      } catch (err) {
        console.warn('Failed to fetch Audius seed tracks:', err.message);
      }
    }
    audiusTracks = cachedAudiusSongs || [];

    const normalizedList = [...songs, ...audiusTracks, ...jamendoTracks].map(s => normalizeTrack(s));
    res.status(200).json(normalizedList);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

export const getSongById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid song ID' });
    }
    const song = await Song.findById(id).lean();
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }
    res.status(200).json(normalizeTrack(song));
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

export const createSong = async (req, res) => {
  try {
    const { title, artist, genre, mood, albumArt, audioUrl, youtubeId, language, playbackType } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ message: 'Title and artist are required' });
    }
    const song = await Song.create({ 
      title, 
      artist, 
      genre, 
      mood, 
      albumArt, 
      audioUrl,
      youtubeId,
      language,
      playbackType: playbackType || (youtubeId ? 'full' : (audioUrl ? 'preview' : 'none')),
      isPlayable: Boolean(audioUrl || youtubeId)
    });
    res.status(201).json(normalizeTrack(song));
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    res.status(500).json({ message: 'Server Error' });
  }
};
