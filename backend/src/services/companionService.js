import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Playlist from '../models/Playlist.js';
import Favorite from '../models/Favorite.js';
import { searchItunesTracks, searchItunesByQuery } from './itunesService.js';
import { searchJamendoTracks } from './jamendoService.js';
import { searchAudiusTracks } from './audiusService.js';
import { callAIJson } from './aiProviderService.js';
import { normalizePlaylistSong } from '../controllers/playlistController.js';

// Music-related keywords and intents in English, Hindi, and Hinglish
const MUSIC_KEYWORDS = [
  'music', 'song', 'songs', 'track', 'tracks', 'artist', 'artists', 'album', 'albums',
  'playlist', 'playlists', 'listen', 'listening', 'play', 'player', 'vibe', 'vibes',
  'genre', 'bollywood', 'pop', 'rock', 'hip hop', 'hip-hop', 'acoustic', 'classical',
  'mood', 'sad', 'happy', 'calm', 'energetic', 'relax', 'relaxing', 'focus', 'chill',
  'romantic', 'party', 'dance', 'lo-fi', 'lofi', 'hindi', 'punjabi', 'english',
  'arijit', 'pritam', 'shreya', 'badshah', 'sidhu', 'maroon 5', 'taylor', 'ed sheeran',
  'low', 'down', 'tired', 'stressed', 'anxious', 'excited', 'workout', 'gym', 'sleep',
  'meditation', 'heartbroken', 'lonely', 'uplifting', 'soothing', 'melodic', 'soundtrack',
  'tune', 'tunes', 'sing', 'singer', 'first song', 'next song', 'favorite', 'favorites',
  'save', 'pause', 'resume', 'shuffle', 'queue', 'skip',
  // Comparative and follow-up music controls
  'softer', 'faster', 'calmer', 'slower', 'quieter', 'louder', 'tempo', 'upbeat', 'mellow', 'peaceful',
  'different', 'change', 'switch', 'more', 'next', 'previous', 'start', 'reset', 'repeat', 'taste',
  // Hindi & Hinglish keywords in Latin script
  'gaana', 'gaane', 'gana', 'gane', 'geet', 'sangeet', 'dhun', 'tarana', 'sur', 'rag',
  'bajaao', 'bajao', 'baja', 'sunao', 'sunvao', 'sunna', 'sunne', 'chalao', 'chalwao',
  'udaas', 'udas', 'dukhi', 'gham', 'gam', 'dard', 'toota', 'rona', 'ro', 'rone',
  'khush', 'khushi', 'masti', 'josh', 'anand', 'prasann', 'badiya', 'mast',
  'shaant', 'shant', 'sukoon', 'shanti', 'aram', 'aaram', 'neend', 'padhai', 'dhyan',
  'energy', 'dhamaka', 'dhamakedar', 'kasrat', 'tezz', 'tez',
  'pyaar', 'pyar', 'ishq', 'mohabbat', 'prem', 'dil', 'pehla', 'doosra', 'dusra', 'agla',
  // Devanagari Hindi terms
  'गाना', 'गाने', 'गीत', 'संगीत', 'धुन', 'बजाओ', 'सुनाओ', 'चलाओ', 'उदास', 'खुश', 'शांत', 'सुकून', 'प्यार', 'रोमांटिक'
];

const NON_MUSIC_PATTERNS = [
  /\b(weather|forecast)\b/i,
  /\b(write|create)\s+(code|python|javascript|script|html|css|sql|function)\b/i,
  /\b(stock|shares|crypto|bitcoin|trading)\b/i,
  /\b(math|calculate|integral|derivative|algebra)\b/i,
  /\b(president|election|politics|government)\b/i,
  /\b(recipe|cook|ingredients|baking)\b/i,
  /\b(diagnose|disease|symptoms|medicine|prescription|antibiotics|cure cancer)\b/i
];

/**
 * Checks if user message is related to music, emotions for music, or playback commands.
 */
export const isMusicRelated = (message = '', context = {}) => {
  const text = message.trim().toLowerCase();
  if (!text) return true;

  // Greetings or companion introductions
  if (/^(hi|hello|hey|yo|namaste|namaskar|kaisa hai|kaise ho|kya haal hai|pranam|greetings|help|who are you|what can you do)[\s!.]*$/i.test(text)) {
    return true;
  }

  // Devanagari script detection
  if (/[\u0900-\u097F]/.test(text)) {
    if (/(गाना|गाने|गीत|संगीत|धुन|बजाओ|सुनाओ|चलाओ|उदास|खुश|शांत|सुकून|प्यार|रोमांटिक|नमस्ते|प्रणाम|हाल)/i.test(text)) {
      return true;
    }
  }

  // Explicit non-music checks
  for (const pattern of NON_MUSIC_PATTERNS) {
    if (pattern.test(text)) {
      return false;
    }
  }

  // Follow-up refinement and command intents in conversational context
  if (/\b(change(\s+it)?|make\s+it\s+different|something\s+(?:else|softer|faster|calmer|different|new)|start\s+over|reset|softer|faster|calmer|speed\s+it\s+up|don'?t\s+repeat|more\s+like|more\s+songs?|new\s+songs?|different\s+songs?|switch\s+to|instead|based\s+on\s+my\s+taste|keep\s+the\s+genre)\b/i.test(text)) {
    return true;
  }

  // Check music keywords
  const words = text.split(/[\s,?.!]+/);
  const hasMusicWord = words.some(w => MUSIC_KEYWORDS.includes(w));
  if (hasMusicWord) return true;

  // Short mood descriptions
  if (/\b(feel|feeling|mood|sad|happy|lonely|down|tired|stressed|bored|hyped|udaas|udas|dukhi|khush|sukoon|shaant|shant|dard|pyaar)\b/i.test(text)) {
    return true;
  }
  if (/(aaj\s+mood|dil\s+toot|man\s+nahi\s+lag|neend\s+nahi)/i.test(text)) {
    return true;
  }

  // If ongoing conversation context exists (e.g. currentMood or recent recommendations), conversational follow-ups are valid
  if (context && (context.currentMood || context.genre || (Array.isArray(context.lastRecommendedSongs) && context.lastRecommendedSongs.length > 0))) {
    if (/^(different|change|more|softer|faster|new|stop|another|next)[\s.!?]*$/i.test(text)) {
      return true;
    }
  }

  return false;
};

/**
 * Normalizes a song from MongoDB, iTunes, Audius, or Jamendo into standard Companion song card format
 */
export const formatCompanionSong = (song) => {
  const id = song._id ? song._id.toString() : (song.id ? song.id.toString() : '');
  const title = song.title || song.name || 'Unknown Title';
  const artist = song.artist || song.artist_name || 'Unknown Artist';
  const cover = song.cover || song.albumArt || song.image || null;
  const audioUrl = song.audioUrl || song.audio || song.previewUrl || null;
  const isPlayable = Boolean(audioUrl || song.isPlayable);
  const duration = song.duration || 30;
  const provider = song.provider || song.source || 'mongodb';
  const isFull = Boolean(song.isFullAudio || provider === 'audius' || provider === 'jamendo' || (duration > 60 && song.playbackType === 'full'));

  return {
    _id: id,
    id: id,
    title,
    artist,
    album: song.album || 'Single',
    cover,
    albumArt: cover,
    audioUrl,
    previewUrl: audioUrl,
    duration,
    playbackType: isFull ? 'full' : 'preview',
    isPreview: !isFull,
    isFullAudio: isFull,
    previewLabel: isFull ? 'Full Track' : '30-sec Preview',
    sourceLabel: provider === 'audius' ? 'Audius' : (provider === 'jamendo' ? 'Jamendo' : (provider === 'itunes' ? 'iTunes' : 'Moodify')),
    isPlayable,
    genre: song.genre || 'Music',
    mood: song.mood || (song.moods && song.moods[0]) || 'Neutral',
    language: song.language || 'English',
    source: provider,
    provider: provider
  };
};

/**
 * Normalizes title and artist for reliable deduplication across MongoDB, iTunes, Audius, and Jamendo
 */
export const normalizeTrackKey = (title = '', artist = '') => {
  const cleanTitle = (title || '')
    .toLowerCase()
    .replace(/\s*[\(\[](?:from\s+[^)\]]+|original\s+motion\s+picture\s+soundtrack|soundtrack|ost|official\s+(?:audio|video|music\s+video)|official|music\s+video|lyric\s+video|lyrics|remastered|remaster|live(?:\s+at[^\)\]]*|\s+from[^\)\]]*)?)[\)\]]/gi, '')
    .replace(/\b(official\s+audio|official\s+video|official\s+music\s+video|lyric\s+video|lyrics|remastered|remaster)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const cleanArtist = (artist || '')
    .toLowerCase()
    .replace(/\b(feat\.|ft\.|featuring|presents)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return {
    cleanTitle,
    cleanArtist,
    key: cleanArtist ? `${cleanTitle}:::${cleanArtist}` : cleanTitle
  };
};

/**
 * Detects whether the user is requesting new/different songs from previous recommendations
 */
export const isNewSongsRequest = (message = '') => {
  const text = (message || '').toLowerCase();
  return (
    /\b(new\s+(?:[a-z-]+\s+)?(?:songs?|tracks?|gaane|gana|music|hits)|different\s+(?:[a-z-]+\s+)?(?:songs?|tracks?|gaane|gana|music)|more\s+(?:[a-z-]+\s+)?(?:songs?|tracks?|gaane|gana|music)|another\s+(?:\d+|five|ten|few|batch)?\s*(?:[a-z-]+\s+)?(?:songs?|tracks?|gaane)?|something\s+(?:else|different|new)|suggest\s+something\s+else|don'?t\s+repeat|do\s+not\s+repeat|other\s+(?:songs?|tracks?|gaane)|haven'?t\s+(?:suggested|recommended|heard)|not\s+recommended|never\s+recommended|naye\s+(?:songs?|tracks?|gaane|gana)|kuch\s+naye|naye\s+sunao|aur\s+naye|aur\s+(?:songs?|gaane)|kuch\s+aur|jo\s+pehle\s+nahi|alag\s+(?:songs?|tracks?|gaane)|kuch\s+alag|pehle\s+wale\s+mat)\b/i.test(text) ||
    /(नए\s+गाने|कुछ\s+नए|और\s+गाने|और\s+नए|जो\s+पहले\s+नहीं|अलग\s+गाने|दोहराना\s+मत)/i.test(text)
  );
};

/**
 * Detects whether the user explicitly requests songs never recommended before across their entire history
 */
export const isNeverRecommendedBefore = (message = '') => {
  const text = (message || '').toLowerCase();
  return (
    /\b(not\s+recommended(?:\s+to\s+me)?\s+before|haven'?t\s+recommended(?:\s+to\s+me)?\s+before|never\s+recommended|never\s+(?:suggested|heard|given)|pehle\s+kabhi\s+nahi|jo\s+kabhi\s+nahi\s+sune|kabhi\s+nahi\s+(?:diye|sunaye))\b/i.test(text) ||
    /(पहले\s+कभी\s+नहीं|कभी\s+नहीं\s+दिए|कभी\s+नहीं\s+सुने)/i.test(text)
  );
};

/**
 * Fetches real favorite tracks for the authenticated user from MongoDB
 */
export const getUserFavoriteTracks = async (userId) => {
  if (!userId) return [];
  try {
    const favorites = await Favorite.find({ userId }).sort({ createdAt: -1 });
    if (!favorites || favorites.length === 0) return [];

    const mongoIds = favorites
      .filter(f => !f.externalData && f.songId && mongoose.Types.ObjectId.isValid(f.songId))
      .map(f => f.songId);
    const mongoSongs = mongoIds.length > 0 ? await Song.find({ _id: { $in: mongoIds } }) : [];
    const songMap = new Map(mongoSongs.map(s => [s._id.toString(), s]));

    const tracks = [];
    for (const fav of favorites) {
      if (fav.externalData && typeof fav.externalData === 'object') {
        const ext = { ...fav.externalData };
        const formatted = formatCompanionSong(ext);
        if (formatted.isPlayable) tracks.push(formatted);
      } else if (fav.songId) {
        const matched = songMap.get(String(fav.songId));
        if (matched) {
          const formatted = formatCompanionSong(matched.toObject());
          if (formatted.isPlayable) tracks.push(formatted);
        }
      }
    }
    return tracks;
  } catch (err) {
    console.warn('getUserFavoriteTracks error:', err.message);
    return [];
  }
};

/**
 * Extracts requested number of songs from user message (e.g., "10 songs", "10-song", "dus gaane", "five tracks")
 */
export const extractSongCount = (message = '') => {
  const text = message.toLowerCase();

  // Explicit number pattern with optional descriptive words (e.g. "15 ambient calm songs", "2 energetic songs", "5 new songs")
  const numMatch = text.match(/\b(\d+)\s+(?:[a-zA-Z-]+\s+){0,3}(?:songs?|tracks?|gaane|gana|geet|items?)\b/i) ||
                   text.match(/\b(\d+)\s*(?:-?\s*(?:songs?|tracks?|gaane|gana|geet|items?))\b/i);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (!isNaN(val) && val > 0) return Math.min(25, val);
  }

  // Preceding creation command: "create a 10 song playlist", "give me 7 songs", "suggest 5"
  const createMatch = text.match(/\b(?:create|make|give(?:\s+me)?|suggest|recommend|playlist\s+of|generate|banao)\s+(?:a\s+)?(\d+)\b/i);
  if (createMatch) {
    const val = parseInt(createMatch[1], 10);
    if (!isNaN(val) && val > 0) return Math.min(25, val);
  }

  // Word numbers in English and Hindi/Hinglish
  const wordMap = {
    'one': 1, 'ek': 1,
    'two': 2, 'do': 2,
    'three': 3, 'teen': 3,
    'four': 4, 'chaar': 4,
    'five': 5, 'paanch': 5,
    'six': 6, 'chhah': 6,
    'seven': 7, 'saat': 7,
    'eight': 8, 'aath': 8,
    'nine': 9, 'nau': 9,
    'ten': 10, 'dus': 10,
    'eleven': 11, 'gyarah': 11,
    'twelve': 12, 'barah': 12,
    'fifteen': 15, 'pandrah': 15,
    'twenty': 20, 'bees': 20
  };

  for (const [word, count] of Object.entries(wordMap)) {
    const pattern = new RegExp(`\\b${word}\\s+(?:[a-zA-Z-]+\\s+){0,3}(?:songs?|tracks?|gaane|gana|geet|items?)\\b`, 'i');
    if (pattern.test(text)) {
      return count;
    }
  }

  return null;
};

/**
 * Detects whether the user is requesting an emotional mood progression / transition
 * Example: "starts sad, gradually becomes happy, and then energetic" -> ['Sad', 'Happy', 'Energetic']
 */
export const extractMoodProgression = (message = '') => {
  const text = message.toLowerCase();

  const moodKeywords = [
    { mood: 'Sad', patterns: ['sad', 'reflective', 'udaas', 'udas', 'dukhi', 'low', 'down', 'heartbroken', 'melancholic'] },
    { mood: 'Calm', patterns: ['calm', 'peaceful', 'soothing', 'gentle', 'shaant', 'shant', 'sukoon', 'relaxing', 'chill', 'hopeful'] },
    { mood: 'Happy', patterns: ['happy', 'joyful', 'uplifting', 'cheerful', 'khush', 'positive', 'good vibe', 'bright'] },
    { mood: 'Energetic', patterns: ['energetic', 'hype', 'party', 'dance', 'high-energy', 'workout', 'josh', 'dhamaka', 'fast'] },
    { mood: 'Romantic', patterns: ['romantic', 'love', 'pyaar', 'pyar', 'ishq', 'dil'] },
    { mood: 'Neutral', patterns: ['neutral', 'grounding', 'mellow'] }
  ];

  // Check for transition-oriented phrases
  const hasTransitionPhrasing = /(?:starts?|begins?|from|shuru|gradually|then|becomes?|leads? to|moves? to|turns? into|progresses? to|se|aur phir|aur agla)\s+/i.test(text) ||
    /\b(?:sad\s+to\s+happy|calm\s+to\s+energetic|low\s+to\s+high|journey|transition|progression)\b/i.test(text);

  if (!hasTransitionPhrasing) return null;

  // Find all matching moods in the exact chronological order of their appearance in the prompt
  const matches = [];
  moodKeywords.forEach(({ mood, patterns }) => {
    patterns.forEach(pat => {
      const idx = text.indexOf(pat);
      if (idx !== -1) {
        matches.push({ mood, index: idx });
      }
    });
  });

  if (matches.length < 2) return null;

  // Sort by index in string
  matches.sort((a, b) => a.index - b.index);

  // Deduplicate consecutive identical moods
  const orderedMoods = [];
  matches.forEach(m => {
    if (orderedMoods.length === 0 || orderedMoods[orderedMoods.length - 1] !== m.mood) {
      orderedMoods.push(m.mood);
    }
  });

  return orderedMoods.length >= 2 ? orderedMoods : null;
};

/**
 * Searches real tracks from MongoDB catalog and iTunes with strict deduplication
 */
export const fetchCompanionTracks = async ({
  mood,
  genre,
  language,
  artist,
  energy,
  limit = 4,
  excludedIds = new Set(),
  excludedKeys = new Set()
}) => {
  let matchedSongs = [];
  const seenIds = new Set(Array.from(excludedIds || []).map(String));
  const seenKeys = new Set(Array.from(excludedKeys || []).map(k => String(k).toLowerCase()));

  const addTrack = (formattedTrack) => {
    if (!formattedTrack || !formattedTrack.isPlayable) return false;
    const id = String(formattedTrack.id || formattedTrack._id || formattedTrack.songId || '');
    const { cleanTitle, cleanArtist, key } = normalizeTrackKey(formattedTrack.title, formattedTrack.artist);
    if (!key && !id) return false;
    if ((id && seenIds.has(id)) || (key && seenKeys.has(key))) {
      return false;
    }
    if (id) seenIds.add(id);
    if (key) seenKeys.add(key);
    matchedSongs.push(formattedTrack);
    return true;
  };

  // 1. Query verified MongoDB songs (expanded candidate pool up to 50 for deep discovery)
  const mongoQuery = {};
  if (mood && mood !== 'All') {
    mongoQuery.$or = [
      { mood: new RegExp(`^${mood}$`, 'i') },
      { moods: new RegExp(mood, 'i') }
    ];
  }
  if (genre && genre !== 'All') {
    mongoQuery.genre = new RegExp(genre, 'i');
  }
  if (language && language !== 'All') {
    mongoQuery.language = new RegExp(language, 'i');
  }
  if (artist) {
    mongoQuery.artist = new RegExp(artist, 'i');
  }

  try {
    const dbSongs = await Song.find(mongoQuery).limit(50);
    for (const s of dbSongs) {
      const formatted = formatCompanionSong(s.toObject());
      addTrack(formatted);
      if (matchedSongs.length >= limit) break;
    }
  } catch (err) {
    console.warn('Companion MongoDB query error:', err.message);
  }

  // 2. Supplement with live iTunes search across varied queries if needed
  if (matchedSongs.length < limit) {
    try {
      const isIndianCatalog = /hindi|bollywood|punjabi|desi/i.test(language || '') || /bollywood|punjabi|desi/i.test(genre || '');
      const queryList = [];

      if (artist) {
        queryList.push(`${artist} hits`);
        queryList.push(`${artist} songs`);
      }

      if (mood === 'Energetic' || energy === 'energetic') {
        if (isIndianCatalog) {
          queryList.push('Bollywood Workout');
          queryList.push('Hindi Dance EDM');
          queryList.push('Punjabi Party Hits');
          queryList.push('Bollywood Fast Songs');
        } else {
          queryList.push('workout electronic dance');
          queryList.push('high energy rock');
          queryList.push('edm festival');
          queryList.push('upbeat energetic dance pop');
        }
      } else if (mood === 'Sad' || energy === 'low') {
        if (isIndianCatalog) {
          queryList.push('Arijit Singh Sad Songs');
          queryList.push('Bollywood Emotional');
          queryList.push('Hindi Sad Melodies');
        } else {
          queryList.push('acoustic sad songs');
          queryList.push('melancholic piano acoustic');
          queryList.push('heartbreak pop');
        }
      } else if (mood === 'Calm' || energy === 'calm') {
        if (isIndianCatalog) {
          queryList.push('Bollywood Acoustic Romantic');
          queryList.push('Hindi Lofi Chill');
          queryList.push('Sufi Soul');
        } else {
          queryList.push('acoustic relaxation');
          queryList.push('ambient chillout');
          queryList.push('peaceful piano');
        }
      } else if (mood === 'Happy' || energy === 'upbeat') {
        if (isIndianCatalog) {
          queryList.push('Bollywood Party Hits');
          queryList.push('Hindi Dance Songs');
          queryList.push('Bollywood Happy Songs');
        } else {
          queryList.push('upbeat feel good pop');
          queryList.push('summer dance pop');
          queryList.push('happy hits');
        }
      } else if (mood === 'Romantic') {
        if (isIndianCatalog) {
          queryList.push('Bollywood Romance');
          queryList.push('Hindi Soulful Love Songs');
        } else {
          queryList.push('romantic love ballads');
          queryList.push('acoustic love songs');
        }
      }

      if (genre && genre !== 'All') {
        queryList.push(`${genre} hits`);
        if (mood) queryList.push(`${mood} ${genre}`);
      }
      if (language && language !== 'All') {
        queryList.push(`${language} songs`);
      }

      if (queryList.length === 0) {
        queryList.push([mood, genre, language].filter(Boolean).join(' ') || 'popular songs');
      }

      // First query standard mood-based itunes search (compatible with test mocks)
      if (mood) {
        const itunesMoodResults = await searchItunesTracks(
          mood,
          language || (isIndianCatalog ? 'Hindi' : 'English'),
          genre ? [genre] : [],
          Math.max(limit * 3, 20)
        );
        for (const t of (itunesMoodResults || [])) {
          const audio = t.audio_url || t.audioUrl || t.previewUrl;
          if (audio) {
            const formatted = formatCompanionSong({
              id: t.id,
              title: t.title,
              artist: t.artist,
              albumArt: t.albumArt || t.cover || t.artwork,
              cover: t.cover || t.albumArt || t.artwork,
              audioUrl: audio,
              duration: t.duration || 30,
              genre: t.genre || genre,
              mood: t.mood || mood,
              language: t.language || language,
              provider: 'itunes',
              playbackType: 'preview',
              isPlayable: true
            });
            addTrack(formatted);
            if (matchedSongs.length >= limit) break;
          }
        }
      }

      // If still under limit, query multi-query terms to fetch additional unique candidates
      for (const query of queryList) {
        if (matchedSongs.length >= limit) break;
        const itunesResults = await searchItunesByQuery(query, Math.max(limit * 2, 20));

        for (const t of (itunesResults || [])) {
          const audio = t.audio_url || t.audioUrl || t.previewUrl;
          if (audio) {
            const formatted = formatCompanionSong({
              id: t.id,
              title: t.title,
              artist: t.artist,
              albumArt: t.albumArt || t.cover || t.artwork,
              cover: t.cover || t.albumArt || t.artwork,
              audioUrl: audio,
              duration: t.duration || 30,
              genre: t.genre || genre,
              mood: t.mood || mood,
              language: t.language || language,
              provider: 'itunes',
              playbackType: 'preview',
              isPlayable: true
            });
            addTrack(formatted);
            if (matchedSongs.length >= limit) break;
          }
        }
      }
    } catch (err) {
      console.warn('Companion iTunes supplement error:', err.message);
    }
  }

  // 3. Supplement with Jamendo tracks if configured and still under limit
  if (matchedSongs.length < limit && process.env.JAMENDO_CLIENT_ID) {
    try {
      const jamendoResults = await searchJamendoTracks({ mood, genre, limit: Math.max(limit * 2, 10) });
      for (const t of (jamendoResults || [])) {
        addTrack(formatCompanionSong(t));
        if (matchedSongs.length >= limit) break;
      }
    } catch (err) {
      console.warn('Companion Jamendo supplement error:', err.message);
    }
  }

  // 4. Supplement with Audius tracks if not in test environment and still under limit
  if (matchedSongs.length < limit && process.env.NODE_ENV !== 'test') {
    try {
      const audiusResults = await searchAudiusTracks({ mood, genre, limit: Math.max(limit * 2, 10) });
      for (const t of (audiusResults || [])) {
        addTrack(formatCompanionSong(t));
        if (matchedSongs.length >= limit) break;
      }
    } catch (err) {
      console.warn('Companion Audius supplement error:', err.message);
    }
  }

  // 5. Fallback: If still under limit and no specific mood, artist, or genre constraints were requested
  if (matchedSongs.length < limit && !mood && !artist && !genre) {
    try {
      const fallbackSongs = await Song.find({ isPlayable: true }).limit(50);
      for (const s of fallbackSongs) {
        addTrack(formatCompanionSong(s.toObject()));
        if (matchedSongs.length >= limit) break;
      }
    } catch (err) {
      console.warn('Companion fallback query error:', err.message);
    }
  }

  return matchedSongs.slice(0, limit);
};

/**
 * Generates an ordered multi-stage transition playlist
 */
export const generateTransitionPlaylist = async ({
  moods,
  totalCount = 10,
  genre,
  language
}) => {
  const numStages = moods.length;
  // Calculate tracks per stage (e.g., 10 / 3 -> [3, 4, 3])
  const baseCount = Math.floor(totalCount / numStages);
  const remainder = totalCount % numStages;

  const stageCounts = moods.map((m, idx) => {
    return baseCount + (idx === Math.floor(numStages / 2) ? remainder : 0);
  });

  const fullPlaylist = [];
  const excludedIds = new Set();
  const excludedKeys = new Set();

  for (let i = 0; i < moods.length; i++) {
    const stageMood = moods[i];
    const needed = stageCounts[i];
    const stageTracks = await fetchCompanionTracks({
      mood: stageMood,
      genre,
      language,
      limit: needed,
      excludedIds,
      excludedKeys
    });

    stageTracks.forEach(t => {
      const id = String(t.id || t._id || t.songId || '');
      if (id) excludedIds.add(id);
      const { key } = normalizeTrackKey(t.title, t.artist);
      if (key) excludedKeys.add(key);
      fullPlaylist.push({
        ...t,
        transitionStage: stageMood,
        stageIndex: i + 1
      });
    });
  }

  return {
    tracks: fullPlaylist,
    requestedCount: totalCount,
    actualCount: fullPlaylist.length,
    moods
  };
};

/**
 * Main Companion engine handling conversational intelligence, topic guardrails,
 * recommendations, playlist saving, favorites, and music control actions.
 */
export const processCompanionMessage = async ({
  message,
  context = {},
  preferences = {},
  user
}) => {
  const cleanMsg = (message || '').trim();
  const lowerMsg = cleanMsg.toLowerCase();
  const userId = user ? (user.id || user._id) : context.userId;

  // 1. TOPIC GUARDRAIL: Verify music relevance
  if (!isMusicRelated(cleanMsg, context)) {
    return {
      text: "I'm Moodify AI, your music companion. I can help you discover songs, build playlists, control playback, and match music to your vibe. How can I soundtrack your day today?",
      recommendations: [],
      quickReplies: [
        'Calm and relaxing',
        'Emotional Bollywood',
        'Uplifting music',
        'Energetic songs',
        'Create a 10-song mood journey'
      ],
      action: null,
      contextUpdate: {}
    };
  }

  // Detect Hindi or Hinglish language
  const isHindiOrHinglish = /[\u0900-\u097F]/.test(cleanMsg) ||
    /\b(gaana|gaane|gana|gane|geet|sangeet|bajao|bajaao|baja|sunao|sunvao|chalao|chalwao|kuch|thoda|mujhe|mera|meri|aaj|dil|udaas|udas|dukhi|khush|sukoon|shaant|shant|neend|padhai|pyaar|pyar|badiya|mast|pehla|doosra|dusra|agla|wala|wali|hai|hain|hoon|ho|ke|ko|se|mein|save\s+kar|add\s+karo)\b/i.test(cleanMsg);

  // 2. PLAYBACK CONTROL INTENTS: Pause, Resume, Play, Stop
  if (/\b(pause(\s+the\s+music|\s+playback)?|roko|gaana\s+roko|pause\s+karo|stop\s+music)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Gaana pause kar diya hai." : "Paused playback for you.",
      recommendations: [],
      quickReplies: ['Resume playback', 'Play next song', 'Change this song'],
      action: { type: 'PAUSE' },
      contextUpdate: {}
    };
  }

  if (/\b(skip(\s+this\s+song|\s+track)?|agla\s+gaana(\s+chalao|\s+bajao)?|next\s+track|next\s+song|play\s+next)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Agla track play kar raha hoon." : "Playing the next track for you.",
      recommendations: [],
      quickReplies: ['Keep this vibe', 'Suggest something calmer', 'More energetic'],
      action: { type: 'PLAY_NEXT' },
      contextUpdate: {}
    };
  }

  if (!/\b(agla|next)\b/i.test(lowerMsg) && /\b(resume(\s+the\s+music|\s+playback)?|continue\s+playing|chalao|gaana\s+chalao|play\s+again)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Playback dobara shuru kar diya hai." : "Resumed playback.",
      recommendations: [],
      quickReplies: ['Pause', 'Next song', 'Favorite this song'],
      action: { type: 'RESUME' },
      contextUpdate: {}
    };
  }

  if (/\b(previous\s+song|play\s+previous|pichhla\s+gaana|pehle\s+wala\s+gaana)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Pichhla gaana play kar raha hoon." : "Playing the previous track for you.",
      recommendations: [],
      quickReplies: ['Next song', 'Pause', 'Favorite this song'],
      action: { type: 'PLAY_PREVIOUS' },
      contextUpdate: {}
    };
  }

  if (/\b(shuffle(\s+mode|\s+songs|\s+on|\s+off)?|toggle\s+shuffle)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Shuffle mode toggle kar diya hai." : "Toggled shuffle mode for your queue.",
      recommendations: [],
      quickReplies: ['Play next song', 'Pause', 'Current song details'],
      action: { type: 'TOGGLE_SHUFFLE' },
      contextUpdate: {}
    };
  }

  // 3. CURRENT SONG DETAILS INTENT
  if (/\b(what\s+song\s+is\s+this|which\s+song\s+is\s+playing|what('?s| is)\s+playing|current\s+song(?:\s+details)?|kaun\s+sa\s+gaana\s+chal\s+raha\s+hai)\b/i.test(lowerMsg)) {
    const current = context.nowPlaying;
    if (current && current.title) {
      const details = isHindiOrHinglish
        ? `Abhi **${current.title}** (${current.artist}) chal raha hai. Iska mood: **${current.mood || 'Music'}**.`
        : `You are currently listening to **${current.title}** by ${current.artist}. Mood: **${current.mood || 'Music'}**.`;
      return {
        text: details,
        recommendations: [current],
        quickReplies: ['Add this song to my favorites', 'Play another song with the same vibe', 'Play next song'],
        action: null,
        contextUpdate: {}
      };
    } else {
      return {
        text: isHindiOrHinglish
          ? "Abhi koi gaana nahi chal raha hai. Aap mujhse koi gaana ya playlist chalaane ko keh sakte hain!"
          : "No song is currently playing. Ask me to play a song or generate a playlist for your mood!",
        recommendations: [],
        quickReplies: ['Play first song', 'Create a 10-song playlist', 'Emotional Bollywood'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 4A. FAVORITES: Play single favorite track ("play my favorite song", "mera favorite gaana bajao")
  const isPlayFavoriteTrack = /\b(?:play\s+(?:my\s+|a\s+|the\s+)?fav(?:orite)?\s+song|mera\s+(?:favorite|pasandida)\s+gaana\s+(?:chalao|bajao|bajaao|sunao))\b/i.test(lowerMsg);
  if (isPlayFavoriteTrack) {
    if (!userId) {
      return {
        text: isHindiOrHinglish ? "Apna favorite gaana sunne ke liye kripya log in karein." : "Please log in to play your saved favorite song.",
        recommendations: [],
        quickReplies: ['Log In', 'Emotional Bollywood', 'Calm and relaxing'],
        action: null,
        contextUpdate: {}
      };
    }
    const favoriteTracks = await getUserFavoriteTracks(userId);
    if (favoriteTracks.length === 0) {
      return {
        text: isHindiOrHinglish
          ? "Aapke paas abhi koi favorite gaana save nahi hai. Kisi bhi gaane par heart icon tap karke ya 'Add this song to my favorites' kehkar gaana save karein."
          : "You don't have any saved favorite songs yet. Tap the heart icon on any song or say 'Add this song to my favorites' to save tracks!",
        recommendations: [],
        quickReplies: ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music'],
        action: null,
        contextUpdate: {}
      };
    }
    const target = favoriteTracks[0];
    return {
      text: isHindiOrHinglish
        ? `Aapka favorite gaana **${target.title}** (${target.artist}) play kar raha hoon.`
        : `Playing your favorite song **${target.title}** by ${target.artist} for you.`,
      recommendations: [target],
      quickReplies: isHindiOrHinglish
        ? ['Mere saare favorites play karo', 'Meri saari playlists dikhao', 'Agla gaana bajao']
        : ['Play all my favorites', 'Show my playlists', 'Next song'],
      action: { type: 'PLAY_SONG', song: target },
      contextUpdate: { nowPlaying: target, lastRecommendedSongs: [target] }
    };
  }

  // 4B. FAVORITES: Queue full Favorites collection ("play my favorites", "play my favorite songs", "favorites play karo")
  const isQueueFavorites = (!isPlayFavoriteTrack) && (
    /\b(?:play\s+(?:all\s+)?(?:my\s+)?favorites?(?:\s+songs?|\s+playlist)?|play\s+my\s+favs|favorites?\s+(?:chalao|bajao|bajaao|sunao|play\s*karo)|mere\s+favorites?\s+(?:gaane\s+)?(?:chalao|bajao|bajaao|sunao)|favorites\s+playlist\s+chalao|play\s+songs\s+from\s+(?:my\s+)?favorites?)\b/i.test(lowerMsg) ||
    /(पसंदीदा\s+गाने\s+बजाओ|फेवरिट्स\s+चलाओ)/i.test(lowerMsg)
  );
  if (isQueueFavorites) {
    if (!userId) {
      return {
        text: isHindiOrHinglish ? "Apni favorites collection sunne ke liye kripya log in karein." : "Please log in to play your favorites collection.",
        recommendations: [],
        quickReplies: ['Log In', 'Emotional Bollywood', 'Calm and relaxing'],
        action: null,
        contextUpdate: {}
      };
    }
    const favoriteTracks = await getUserFavoriteTracks(userId);
    if (favoriteTracks.length === 0) {
      return {
        text: isHindiOrHinglish
          ? "Aapki favorites collection abhi khali hai. Gaane sunte hue heart icon tap karein taaki aapka pasandida sangeet yahan save ho sake!"
          : "Your favorites collection is empty right now. Tell me what kind of music you like or explore songs, and tap the heart icon to save your favorites!",
        recommendations: [],
        quickReplies: ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music'],
        action: null,
        contextUpdate: {}
      };
    }
    return {
      text: isHindiOrHinglish
        ? `Aapke saare favorites (${favoriteTracks.length} gaane) queue mein add karke play kar raha hoon.`
        : `Playing your Favorites collection (${favoriteTracks.length} songs) now.`,
      recommendations: favoriteTracks,
      quickReplies: isHindiOrHinglish
        ? ['Gaana pause karo', 'Agla gaana bajao', 'Shuffle toggle karo']
        : ['Pause', 'Next song', 'Toggle shuffle'],
      action: {
        type: 'QUEUE_PLAYLIST',
        songs: favoriteTracks,
        title: 'My Favorites',
        autoplay: true
      },
      contextUpdate: {
        lastRecommendedSongs: favoriteTracks,
        currentQueue: favoriteTracks,
        nowPlaying: favoriteTracks[0]
      }
    };
  }

  // 4C. FAVORITES: List favorites ("show me my favorites", "list my favorite songs", "mere favorite gaane dikhao")
  const isListFavorites = (!isPlayFavoriteTrack) && (!isQueueFavorites) && (
    /\b(?:show\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?favorites?|list\s+(?:all\s+)?(?:my\s+)?favorites?(?:\s+songs?)?|what\s+are\s+my\s+favorites?|mere\s+favorites?\s*(?:dikhao)?|meri\s+favorites\s+list\s+dikhao)\b/i.test(lowerMsg) ||
    /(पसंदीदा\s+दिखाओ|फेवरिट्स\s+दिखाओ)/i.test(lowerMsg)
  );
  if (isListFavorites) {
    if (!userId) {
      return {
        text: isHindiOrHinglish ? "Apne favorite gaane dekhne ke liye kripya log in karein." : "Please log in to view your favorite songs.",
        recommendations: [],
        quickReplies: ['Log In', 'Emotional Bollywood'],
        action: null,
        contextUpdate: {}
      };
    }
    const favoriteTracks = await getUserFavoriteTracks(userId);
    if (favoriteTracks.length === 0) {
      return {
        text: isHindiOrHinglish
          ? "Aapke paas abhi koi favorite gaane nahi hain. Kisi bhi gaane par heart icon tap karke save karein!"
          : "You don't have any favorite songs saved yet. Tap the heart icon on any song to add it to your favorites!",
        recommendations: [],
        quickReplies: ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music'],
        action: null,
        contextUpdate: {}
      };
    }
    const summaries = favoriteTracks.slice(0, 10).map((t, idx) => `${idx + 1}. **${t.title}** - ${t.artist}`).join('\n');
    return {
      text: isHindiOrHinglish
        ? `Aapke favorites mein ye gaane hain:\n\n${summaries}\n\nSunne ke liye kahein: "Play my favorites" ya "Play my favorite song".`
        : `Here are your favorite songs:\n\n${summaries}\n\nSay "Play my favorites" to play the full collection!`,
      recommendations: favoriteTracks,
      quickReplies: isHindiOrHinglish
        ? ['Mere saare favorites play karo', 'Mera favorite gaana bajao', 'Meri saari playlists dikhao']
        : ['Play my favorites', 'Play my favorite song', 'Show my playlists'],
      action: { type: 'FAVORITES_LISTED', songs: favoriteTracks },
      contextUpdate: { lastRecommendedSongs: favoriteTracks }
    };
  }

  // 4D. FAVORITES INTENTS: Add to favorites / Remove from favorites
  const isRemoveFavorite = /\b(remove\s+(?:this\s+)?(?:song\s+)?from\s+(?:my\s+)?favorites?|unfavorite\s+(?:this\s+)?(?:song)?|favorites?\s+se\s+hata(?:o|do|yein)|dislike\s+favorite)\b/i.test(lowerMsg);
  if (isRemoveFavorite) {
    const target = context.nowPlaying || (context.lastRecommendedSongs && context.lastRecommendedSongs[0]);
    if (target && target.title) {
      const targetId = String(target._id || target.id || target.songId);
      if (userId) {
        try {
          await Favorite.findOneAndDelete({
            userId,
            $or: [{ songId: targetId }, { 'externalData.id': targetId }, { 'externalData._id': targetId }]
          });
        } catch (e) {
          console.warn('Remove favorite DB error:', e.message);
        }
      }
      return {
        text: isHindiOrHinglish
          ? `**${target.title}** (${target.artist}) ko aapki favorites list se hata diya hai.`
          : `Removed **${target.title}** by ${target.artist} from your favorites.`,
        recommendations: [target],
        quickReplies: ['Play next song', 'Recommend another song', 'Show my playlists'],
        action: { type: 'REMOVE_FAVORITE', song: target, isFavorite: false },
        contextUpdate: {}
      };
    } else {
      return {
        text: isHindiOrHinglish
          ? "Kaun sa gaana favorites se hatana hai? Kripya gaana chalayein ya uska naam batayein."
          : "Which song would you like to remove from favorites? Please play a track first or specify the title.",
        recommendations: [],
        quickReplies: ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  const isAddFavorite = (!isRemoveFavorite) && (
    /\b(add\s+(?:this\s+)?(?:song\s+)?to\s+(?:my\s+)?favorites?|favorite\s+(?:the\s+)?(?:current\s+)?(?:this\s+)?(?:song)?|like\s+this\s+song)\b/i.test(lowerMsg) ||
    (/\bfavorites?\b/i.test(lowerMsg) && /\b(add|daalo|kar\s*do|karo|rakho|banao)\b/i.test(lowerMsg)) ||
    /\b(favorite\s+me|favorites\s+mein|pasandida\s+me)\b/i.test(lowerMsg) ||
    /(पसंदीदा\s+में\s+जोड़ें|पसंद\s+करो)/i.test(lowerMsg)
  );

  if (isAddFavorite) {
    const target = context.nowPlaying || (context.lastRecommendedSongs && context.lastRecommendedSongs[0]);
    if (target && target.title) {
      const targetId = String(target._id || target.id || target.songId);
      if (userId) {
        try {
          const exists = await Favorite.findOne({ userId, songId: targetId });
          if (!exists) {
            await Favorite.create({
              userId,
              songId: targetId,
              externalData: target
            });
          }
        } catch (favErr) {
          console.warn('Add favorite DB error:', favErr.message);
        }
      }
      return {
        text: isHindiOrHinglish
          ? `**${target.title}** (${target.artist}) ko aapki favorites list mein add kar diya hai!`
          : `Done — I've added **${target.title}** by ${target.artist} to your favorites list!`,
        recommendations: [target],
        quickReplies: ['Play next song', 'Show my playlists', 'Save this playlist'],
        action: { type: 'FAVORITE_SONG', song: target, isFavorite: true },
        contextUpdate: {}
      };
    } else {
      return {
        text: isHindiOrHinglish
          ? "Aap kaun sa gaana favorite mein add karna chahte hain? Koi gaana play karein ya kisi song card par bane heart icon ko tap karein."
          : "Which song would you like to add to favorites? No song is currently playing. Start a song or select one from recommendations!",
        recommendations: [],
        quickReplies: ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 5. PLAYLIST ACTIONS: Save Playlist / Save it
  const isSavePlaylist = /\b(save\s+(?:this\s+)?playlist|save\s+(?:this\s+)?as\s+|save\s+it\b|save\s+this\b|is\s+playlist\s+ko\s+save\s+karo|(?:ise|isko)\s+save\s+kar\s*(?:do|lo|karo))\b/i.test(lowerMsg);
  if (isSavePlaylist) {
    // Extract custom name if given: e.g., "save this playlist as My Mood Journey"
    let playlistName = 'My Mood Journey';
    const nameMatch = cleanMsg.match(/\b(?:as|called|named|ke\s+naam\s+se)\s+["']?([^"'.!?\n]+)["']?/i);
    if (nameMatch && nameMatch[1].trim()) {
      playlistName = nameMatch[1].trim();
    } else if (context.lastGeneratedPlaylist && context.lastGeneratedPlaylist.name) {
      playlistName = context.lastGeneratedPlaylist.name;
    } else if (context.currentMood) {
      playlistName = `${context.currentMood} Journey`;
    }

    // Identify candidate tracks to save
    const tracksToSave = (context.lastGeneratedPlaylist && context.lastGeneratedPlaylist.songs && context.lastGeneratedPlaylist.songs.length > 0)
      ? context.lastGeneratedPlaylist.songs
      : (context.lastRecommendedSongs && context.lastRecommendedSongs.length > 0)
      ? context.lastRecommendedSongs
      : (context.currentQueue && context.currentQueue.length > 0)
      ? context.currentQueue
      : [];

    if (tracksToSave.length === 0) {
      return {
        text: isHindiOrHinglish
          ? "Abhi save karne ke liye koi playlist ya queue nahi hai. Pehle mujhse koi playlist generate karne ko kahein, jaise 'Create a 10-song mood journey'!"
          : "There are no songs in your current queue or recommendations to save. Ask me to generate a playlist first, e.g. 'Create a 10-song mood journey'!",
        recommendations: [],
        quickReplies: ['Create a 10-song mood journey', 'Emotional Bollywood', 'Energetic songs'],
        action: null,
        contextUpdate: {}
      };
    }

    // Persist real playlist to MongoDB for authenticated user
    if (!userId) {
      return {
        text: "Please log in to permanently save playlists to your cloud account.",
        recommendations: tracksToSave.slice(0, 4),
        quickReplies: ['Log In', 'Play first song'],
        action: null,
        contextUpdate: {}
      };
    }

    try {
      const normalizedSongs = [];
      const seenIds = new Set();
      for (const t of tracksToSave) {
        const norm = normalizePlaylistSong(t);
        if (norm && !seenIds.has(norm.id)) {
          seenIds.add(norm.id);
          normalizedSongs.push(norm);
        }
      }

      const coverArt = normalizedSongs.length > 0 ? (normalizedSongs[0].cover || normalizedSongs[0].albumArt || '') : '';
      const createdPlaylist = await Playlist.create({
        userId,
        name: playlistName,
        description: `Created by Moodify AI Companion from ${normalizedSongs.length} curated tracks`,
        coverArt,
        songs: normalizedSongs
      });

      const successText = isHindiOrHinglish
        ? `Mubaarak ho! Aapki playlist **${playlistName}** (${normalizedSongs.length} gaane) safaltapoorvak Playlists section mein save ho gayi hai.`
        : `Saved! Your playlist **${playlistName}** with ${normalizedSongs.length} tracks has been saved to your Playlists.`;

      return {
        text: successText,
        recommendations: normalizedSongs,
        quickReplies: [`Play ${playlistName}`, 'Show my playlists', 'Create another playlist'],
        action: {
          type: 'PLAYLIST_SAVED',
          playlist: createdPlaylist,
          songs: normalizedSongs
        },
        contextUpdate: {
          lastSavedPlaylist: createdPlaylist
        }
      };
    } catch (saveErr) {
      console.error('Save playlist error:', saveErr.message);
      return {
        text: isHindiOrHinglish
          ? "Kshama karein, playlist save karne mein ek error aa gaya. Kripya dobara koshish karein."
          : "Sorry, I encountered an issue saving your playlist to the database. Please try again.",
        recommendations: tracksToSave.slice(0, 4),
        quickReplies: ['Retry save', 'Play first song'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 6. PLAYLIST ACTIONS: Add Song to Playlist
  // Examples: "Add this song to my Chill playlist", "Add current song to Late Night", "Is song ko meri Sad playlist mein add karo"
  const isAddToPlaylist = /\b(?:add\s+(?:this\s+song|current\s+song|it)?\s*to\s+(?:my\s+|the\s+|a\s+|an\s+)?(?:new\s+)?playlist\s+(?:called\s+|named\s+)?["']?([^"'.!?\n]+)["']?|add\s+(?:this\s+song|current\s+song|it)?\s*to\s+(?:my\s+|the\s+|a\s+|an\s+)?(?:new\s+)?["']?([^"'.!?\n]+)["']?\s+playlist|is\s+song\s+ko\s+(?:meri\s+)?["']?([^"'.!?\n]+)["']?\s+playlist\s+mein\s+add\s+karo)\b/i.test(cleanMsg);
  if (isAddToPlaylist) {
    const match = cleanMsg.match(/\b(?:add\s+(?:this\s+song|current\s+song|it)?\s*to\s+(?:my\s+|the\s+|a\s+|an\s+)?(?:new\s+)?playlist\s+(?:called\s+|named\s+)?["']?([^"'.!?\n]+)["']?|add\s+(?:this\s+song|current\s+song|it)?\s*to\s+(?:my\s+|the\s+|a\s+|an\s+)?(?:new\s+)?["']?([^"'.!?\n]+)["']?\s+playlist|is\s+song\s+ko\s+(?:meri\s+)?["']?([^"'.!?\n]+)["']?\s+playlist\s+mein\s+add\s+karo)\b/i);
    const rawTargetName = (match ? (match[1] || match[2] || match[3]) : '').trim();
    let playlistName = rawTargetName.replace(/["']/g, '').trim();
    playlistName = playlistName.replace(/^(?:my|the|a|an|meri|mera)\s+/i, '').trim();
    playlistName = playlistName.replace(/\s+playlist$/i, '').trim();

    const targetSong = context.nowPlaying || (context.lastRecommendedSongs && context.lastRecommendedSongs[0]);

    if (!targetSong) {
      return {
        text: isHindiOrHinglish
          ? "Aap kaun sa gaana add karna chahte hain? Pehle koi gaana play karein ya recommend karne ko kahein."
          : "Which song would you like to add? Please play a song or select one from recommendations first.",
        recommendations: [],
        quickReplies: ['Play first song', 'Show my playlists', 'Recommend a song'],
        action: null,
        contextUpdate: {}
      };
    }

    if (!playlistName) {
      return {
        text: "Which playlist would you like to add this song to? Tell me the name of the playlist, e.g. 'Add this song to my Chill playlist'.",
        recommendations: [targetSong],
        quickReplies: ['Add to Chill playlist', 'Add to Favorites', 'Create a new playlist'],
        action: null,
        contextUpdate: {}
      };
    }

    if (!userId) {
      return {
        text: "Please log in to manage your playlists.",
        recommendations: [targetSong],
        quickReplies: ['Log In'],
        action: null,
        contextUpdate: {}
      };
    }

    try {
      // Check if user already has a playlist with this name (case-insensitive)
      let playlist = await Playlist.findOne({
        userId,
        name: new RegExp(`^${playlistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      if (!playlist) {
        playlist = await Playlist.findOne({
          userId,
          name: new RegExp(playlistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        });
      }

      const normSong = normalizePlaylistSong(targetSong);
      let isNewPlaylist = false;

      if (!playlist) {
        // Create the playlist on demand
        isNewPlaylist = true;
        playlist = await Playlist.create({
          userId,
          name: playlistName,
          description: `Created by Moodify AI Companion`,
          coverArt: normSong.cover || normSong.albumArt || '',
          songs: [normSong]
        });
      } else {
        // Check for duplicates
        const alreadyExists = playlist.songs.some(s => s.id === normSong.id);
        if (alreadyExists) {
          return {
            text: isHindiOrHinglish
              ? `**${targetSong.title}** pehle se hi aapki **${playlist.name}** playlist mein shaamil hai.`
              : `**${targetSong.title}** is already in your **${playlist.name}** playlist.`,
            recommendations: [targetSong],
            quickReplies: ['Show my playlists', 'Play next song', 'Add to favorites'],
            action: null,
            contextUpdate: {}
          };
        }
        playlist.songs.push(normSong);
        if (!playlist.coverArt && normSong.cover) {
          playlist.coverArt = normSong.cover;
        }
        await playlist.save();
      }

      const replyText = isNewPlaylist
        ? (isHindiOrHinglish
          ? `Nayi playlist **${playlist.name}** banayi gayi aur **${targetSong.title}** usme add kar diya gaya!`
          : `Created a new playlist **${playlist.name}** and added **${targetSong.title}** by ${targetSong.artist} to it!`)
        : (isHindiOrHinglish
          ? `Done — **${targetSong.title}** ko aapki **${playlist.name}** playlist mein add kar diya hai.`
          : `Done — **${targetSong.title}** by ${targetSong.artist} was added to your **${playlist.name}** playlist.`);

      return {
        text: replyText,
        recommendations: [targetSong],
        quickReplies: [`Play ${playlist.name}`, 'Show my playlists', 'Play next song'],
        action: {
          type: 'SONG_ADDED_TO_PLAYLIST',
          playlist,
          song: targetSong
        },
        contextUpdate: {}
      };
    } catch (addErr) {
      console.error('Add to playlist error:', addErr.message);
      return {
        text: "Could not add the song to your playlist due to a server error. Please try again.",
        recommendations: [targetSong],
        quickReplies: ['Retry', 'Play next song'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 7A. PLAYLIST ACTIONS: List Playlists
  const isListPlaylists = /\b(?:list\s+(?:all\s+)?(?:my\s+)?playlists?|show\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?playlists?(?:\s+and\s+(?:play|let\s+me\s+choose)\s+one)?|what\s+playlists\s+do\s+i\s+have|meri\s+(?:saari\s+)?playlists?\s*(?:dikhao)?)\b/i.test(lowerMsg);
  if (isListPlaylists) {
    if (!userId) {
      return {
        text: isHindiOrHinglish ? "Apni saved playlists dekhne ke liye kripya log in karein." : "Please log in to view your saved playlists.",
        recommendations: [],
        quickReplies: ['Log In'],
        action: null,
        contextUpdate: {}
      };
    }

    try {
      const userPlaylists = await Playlist.find({ userId }).sort({ updatedAt: -1 });
      if (userPlaylists.length === 0) {
        return {
          text: isHindiOrHinglish
            ? "Aapke paas abhi koi saved playlist nahi hai. Aap mujhse keh sakte hain: 'Create a 10-song playlist' ya 'Save this playlist'!"
            : "You don't have any saved playlists yet. Ask me to create one, e.g., 'Create a 10-song playlist that starts sad and becomes energetic'!",
          recommendations: [],
          quickReplies: ['Create a 10-song playlist', 'Emotional Bollywood', 'Calm and relaxing'],
          action: null,
          contextUpdate: {}
        };
      }

      const playlistSummaries = userPlaylists.map((p, idx) => `${idx + 1}. **${p.name}** (${p.songs.length} tracks)`).join('\n');
      const text = isHindiOrHinglish
        ? `Aapki saved playlists ye rahi:\n\n${playlistSummaries}\n\nKisi bhi playlist ko sunne ke liye kahein: "Play [Playlist Name] playlist" ya "Play the second playlist".`
        : `Here are your saved playlists:\n\n${playlistSummaries}\n\nSay "Play [Playlist Name] playlist" or "Play the second playlist" to start listening!`;

      return {
        text,
        recommendations: [],
        quickReplies: userPlaylists.slice(0, 4).map(p => `Play ${p.name}`),
        action: { type: 'PLAYLISTS_LISTED', playlists: userPlaylists },
        contextUpdate: {}
      };
    } catch (e) {
      console.warn('List playlists error:', e.message);
    }
  }

  // 7B. PLAYLIST ACTIONS: Play by Ordinal ("play the second playlist", "play the 1st playlist", "doosri playlist chalao")
  const ordinalMatch = lowerMsg.match(/\b(?:play\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+playlist|(pehli|doosri|dusri|teesri|chauthi)\s+playlist\s+(?:chalao|bajao|bajaao|sunao))\b/i);
  if (ordinalMatch && userId) {
    const rawOrd = (ordinalMatch[1] || ordinalMatch[2] || '').toLowerCase();
    const ordMap = {
      'first': 0, '1st': 0, 'pehli': 0,
      'second': 1, '2nd': 1, 'doosri': 1, 'dusri': 1,
      'third': 2, '3rd': 2, 'teesri': 2,
      'fourth': 3, '4th': 3, 'chauthi': 3,
      'fifth': 4, '5th': 4
    };
    const targetIdx = ordMap[rawOrd] !== undefined ? ordMap[rawOrd] : 0;
    try {
      const userPlaylists = await Playlist.find({ userId }).sort({ updatedAt: -1 });
      if (userPlaylists.length === 0) {
        return {
          text: isHindiOrHinglish ? "Aapke paas koi saved playlist nahi hai." : "You do not have any saved playlists yet.",
          recommendations: [],
          quickReplies: ['Show my playlists', 'Create a 10-song playlist'],
          action: null,
          contextUpdate: {}
        };
      }
      if (targetIdx >= userPlaylists.length) {
        return {
          text: isHindiOrHinglish
            ? `Aapke paas kewal ${userPlaylists.length} playlists hain, isliye playlist #${targetIdx + 1} uplabdh nahi hai.`
            : `You have ${userPlaylists.length} playlist(s), so playlist #${targetIdx + 1} does not exist.`,
          recommendations: [],
          quickReplies: userPlaylists.map(p => `Play ${p.name}`),
          action: null,
          contextUpdate: {}
        };
      }
      const targetPl = userPlaylists[targetIdx];
      if (!targetPl.songs || targetPl.songs.length === 0) {
        return {
          text: isHindiOrHinglish
            ? `Aapki **${targetPl.name}** playlist khali hai aur isme koi playable tracks nahi hain.`
            : `Your playlist **${targetPl.name}** contains no playable tracks yet.`,
          recommendations: [],
          quickReplies: ['Show my playlists', 'Emotional Bollywood'],
          action: null,
          contextUpdate: {}
        };
      }
      return {
        text: isHindiOrHinglish
          ? `Aapki #${targetIdx + 1} playlist **${targetPl.name}** (${targetPl.songs.length} gaane) play kar raha hoon.`
          : `Playing playlist #${targetIdx + 1}: **${targetPl.name}** (${targetPl.songs.length} tracks).`,
        recommendations: targetPl.songs,
        quickReplies: ['Pause', 'Next song', 'Show my playlists'],
        action: {
          type: 'QUEUE_PLAYLIST',
          songs: targetPl.songs,
          title: targetPl.name,
          autoplay: true
        },
        contextUpdate: {
          lastRecommendedSongs: targetPl.songs,
          currentQueue: targetPl.songs,
          nowPlaying: targetPl.songs[0]
        }
      };
    } catch (ordErr) {
      console.warn('Ordinal playlist error:', ordErr.message);
    }
  }

  // 7C. PLAYLIST ACTIONS: Play Named Playlist ("Play my Chill playlist", "Play songs from my Sad playlist", "Meri Late Night playlist chalao")
  const isPlayNamedPlaylist = cleanMsg.match(/\b(?:play\s+(?:songs\s+from\s+)?(?:my\s+|the\s+)?["']?([^"'.!?\n]+?)["']?\s+playlist|play\s+playlist\s+["']?([^"'.!?\n]+?)["']?|["']?([^"'.!?\n]+?)["']?\s+playlist\s+(?:chalao|bajao|bajaao|sunao|play\s*karo)|play\s+songs\s+from\s+(?:my\s+|the\s+)?["']?([^"'.!?\n]+?)["']?)\b/i);
  if (isPlayNamedPlaylist && userId) {
    let rawRequested = (isPlayNamedPlaylist[1] || isPlayNamedPlaylist[2] || isPlayNamedPlaylist[3] || isPlayNamedPlaylist[4] || '').replace(/["']/g, '').trim();
    rawRequested = rawRequested.replace(/^(?:my|the|a|an|meri|mera|songs\s+from\s+(?:my\s+|the\s+)?)\s+/i, '').trim();
    rawRequested = rawRequested.replace(/\s+playlist$/i, '').trim();

    if (rawRequested && !/^(all|favorites?|favs|next|previous)$/i.test(rawRequested)) {
      try {
        const userPlaylists = await Playlist.find({ userId }).sort({ updatedAt: -1 });
        const exactMatches = userPlaylists.filter(p => p.name.trim().toLowerCase() === rawRequested.toLowerCase());
        const partialMatches = userPlaylists.filter(p => p.name.toLowerCase().includes(rawRequested.toLowerCase()));

        if (exactMatches.length === 1 || (exactMatches.length === 0 && partialMatches.length === 1)) {
          const matchedPlaylist = exactMatches[0] || partialMatches[0];
          if (!matchedPlaylist.songs || matchedPlaylist.songs.length === 0) {
            return {
              text: isHindiOrHinglish
                ? `Aapki **${matchedPlaylist.name}** playlist khali hai aur isme koi gaane nahi hain.`
                : `Your playlist **${matchedPlaylist.name}** contains no playable tracks yet.`,
              recommendations: [],
              quickReplies: ['Show my playlists', 'Add current song to this playlist'],
              action: null,
              contextUpdate: {}
            };
          }
          return {
            text: isHindiOrHinglish
              ? `Aapki **${matchedPlaylist.name}** playlist (${matchedPlaylist.songs.length} gaane) play kar raha hoon.`
              : `Playing your **${matchedPlaylist.name}** playlist (${matchedPlaylist.songs.length} songs) now.`,
            recommendations: matchedPlaylist.songs,
            quickReplies: ['Pause', 'Next song', 'Shuffle playlist'],
            action: {
              type: 'QUEUE_PLAYLIST',
              songs: matchedPlaylist.songs,
              title: matchedPlaylist.name,
              autoplay: true
            },
            contextUpdate: {
              lastRecommendedSongs: matchedPlaylist.songs,
              currentQueue: matchedPlaylist.songs,
              nowPlaying: matchedPlaylist.songs[0]
            }
          };
        } else if (partialMatches.length > 1) {
          const namesList = partialMatches.map(p => `**${p.name}**`).join(', ');
          return {
            text: isHindiOrHinglish
              ? `Aapki kai playlists '**${rawRequested}**' se match karti hain: ${namesList}. Aap kaun si playlist sunna chahenge?`
              : `I found multiple playlists matching '**${rawRequested}**': ${namesList}. Which one would you like to play?`,
            recommendations: [],
            quickReplies: partialMatches.map(p => `Play ${p.name}`),
            action: null,
            contextUpdate: {}
          };
        } else {
          const availableNames = userPlaylists.map(p => `**${p.name}**`);
          const notFoundText = isHindiOrHinglish
            ? `Mujhe '**${rawRequested}**' naam ki koi playlist nahi mili. Aapke paas ye playlists hain: ${availableNames.length > 0 ? availableNames.join(', ') : 'koi playlist nahi'}. Kya aap chahenge ki main '**${rawRequested}**' naam se ek nayi playlist banaoon?`
            : `I couldn't find a playlist named '**${rawRequested}**'. You currently have: ${availableNames.length > 0 ? availableNames.join(', ') : 'no saved playlists'}. Would you like me to create a '**${rawRequested}**' playlist for you?`;
          return {
            text: notFoundText,
            recommendations: [],
            quickReplies: userPlaylists.slice(0, 3).map(p => `Play ${p.name}`),
            action: null,
            contextUpdate: {}
          };
        }
      } catch (e) {
        console.warn('Play named playlist lookup error:', e.message);
      }
    }
  }

  // 7D. PERSONAL MUSIC TASTE PROFILE INTENTS (PHASE 6)
  const isShowTasteIntent = /\b(?:show|view|what\s+are|tell\s+me)\s+(?:about\s+)?(?:my\s+)?(?:taste|preferences|favorite\s+genres|preferred\s+artists|music\s+profile)\b/i.test(lowerMsg) ||
    /\b(?:my\s+favorite\s+genres|my\s+music\s+taste|mera\s+music\s+taste|meri\s+preferences|mera\s+taste)\b/i.test(lowerMsg);

  if (isShowTasteIntent) {
    const favGenres = preferences.favoriteGenres || [];
    const favArtists = preferences.favoriteArtists || [];
    const energyLevel = preferences.energyLevel || null;
    const prefMoods = preferences.preferredMoods || [];
    const listeningModes = preferences.favoriteListeningModes || [];

    const hasAnyPrefs = favGenres.length > 0 || favArtists.length > 0 || Boolean(energyLevel) || prefMoods.length > 0 || listeningModes.length > 0;

    if (hasAnyPrefs) {
      const summaryLines = [
        `🎵 **Favorite Genres:** ${favGenres.length > 0 ? favGenres.join(', ') : 'None selected yet'}`,
        `🎤 **Preferred Artists:** ${favArtists.length > 0 ? favArtists.join(', ') : 'None selected yet'}`,
        `⚡ **Energy Preference:** ${energyLevel ? (energyLevel.charAt(0).toUpperCase() + energyLevel.slice(1)) : 'Balanced (Default)'}`,
        `✨ **Preferred Moods:** ${prefMoods.length > 0 ? prefMoods.join(', ') : 'All moods'}`,
        `🎧 **Favorite Modes:** ${listeningModes.length > 0 ? listeningModes.join(', ') : 'All modes'}`
      ];
      return {
        text: `Here is a summary of your **Personal Music Taste Profile**:\n\n${summaryLines.join('\n')}\n\nYou can ask me to update your preferences anytime, or click your Profile page to customize your taste!`,
        recommendations: [],
        quickReplies: [
          'Recommend songs based on my taste',
          'I want more music like my favorite artists',
          'I prefer energetic music',
          'Recommend something different from my usual taste'
        ],
        action: null,
        contextUpdate: {}
      };
    } else {
      return {
        text: `You haven't set up your Personal Music Taste Profile yet! Tell me your favorite genres (e.g. "Update my preferred genres to Rock, Pop, Indie") or your energy preference (e.g. "I prefer energetic music"), or visit your Profile page to choose your preferences.`,
        recommendations: [],
        quickReplies: [
          'Update my preferred genres to Pop, Rock',
          'I prefer energetic music',
          'Recommend songs based on my taste'
        ],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // Energy preference conversational update
  const energyPrefMatch = lowerMsg.match(/\b(?:i\s+prefer|set\s+my\s+energy\s+to|change\s+energy\s+to)\s+(energetic|high\s+energy|calm|mellow|low\s+energy|balanced|medium\s+energy)\s*(?:music)?\b/i);
  if (energyPrefMatch) {
    const rawVal = energyPrefMatch[1].toLowerCase();
    let mappedVal = 'balanced';
    if (/energetic|high/i.test(rawVal)) mappedVal = 'energetic';
    else if (/calm|mellow|low/i.test(rawVal)) mappedVal = 'calm';
    else if (/balanced|medium/i.test(rawVal)) mappedVal = 'balanced';

    return {
      text: `Got it! I have updated your Personal Music Taste Profile with your energy preference: **${mappedVal}**. Future recommendations will factor this into their scoring.`,
      recommendations: [],
      quickReplies: ['Recommend songs based on my taste', 'Show my favorite genres', 'Recommend something different from my usual taste'],
      action: {
        type: 'UPDATE_PREFERENCES',
        preferences: { energyLevel: mappedVal }
      },
      contextUpdate: {}
    };
  }

  // Update preferred genres conversational update
  const updateGenresMatch = cleanMsg.match(/\b(?:update|change|set)\s+(?:my\s+)?preferred\s+genres(?:\s+to\s+(.+))?\b/i);
  if (updateGenresMatch) {
    const rawGenres = updateGenresMatch[1];
    if (rawGenres && rawGenres.trim()) {
      const extracted = rawGenres
        .split(/,|and|\//i)
        .map(g => g.trim().replace(/[.!?]/g, ''))
        .filter(g => g.length >= 2);

      if (extracted.length > 0) {
        return {
          text: `Done! I've updated your preferred genres to: **${extracted.join(', ')}** in your Personal Music Taste Profile.`,
          recommendations: [],
          quickReplies: ['Recommend songs based on my taste', 'Show my favorite genres', 'I prefer energetic music'],
          action: {
            type: 'UPDATE_PREFERENCES',
            preferences: { favoriteGenres: extracted }
          },
          contextUpdate: {}
        };
      }
    }
    // If user asked to update genres but didn't specify which ones, ask for clarification
    return {
      text: "Which genres would you like to set as your favorites? You can say: 'Update my preferred genres to Rock, Pop, Indie'.",
      recommendations: [],
      quickReplies: [
        'Update my preferred genres to Pop, Rock',
        'Update my preferred genres to Bollywood, Acoustic',
        'Update my preferred genres to Indie, Lo-Fi'
      ],
      action: null,
      contextUpdate: {}
    };
  }

  // Music like my favorite artists
  const isFavoriteArtistsIntent = /\b(?:more\s+music\s+like\s+my\s+favorite\s+artists?|music\s+like\s+my\s+favorite\s+artists?|songs?\s+(?:like|by)\s+my\s+favorite\s+artists?)\b/i.test(lowerMsg);
  if (isFavoriteArtistsIntent) {
    const favArtists = preferences.favoriteArtists || [];
    if (favArtists.length > 0) {
      const targetArtist = favArtists[0];
      const artistTracks = await fetchCompanionTracks({
        artist: targetArtist,
        limit: 4,
        excludedIds: context.sessionTrackIds,
        excludedKeys: context.sessionTrackKeys
      });
      return {
        text: `Here are recommendations inspired by your preferred artist **${targetArtist}**${favArtists.length > 1 ? ` and other favorites (${favArtists.slice(1).join(', ')})` : ''}:`,
        recommendations: artistTracks,
        quickReplies: ['Recommend songs based on my taste', 'Recommend something different from my usual taste', 'Show my favorite genres'],
        action: null,
        contextUpdate: { lastRecommendedSongs: artistTracks }
      };
    } else {
      return {
        text: "You don't have any preferred artists saved in your taste profile yet! Tell me an artist you love, or visit your Profile to add them.",
        recommendations: [],
        quickReplies: ['Show my favorite genres', 'Recommend songs based on my taste', 'I prefer energetic music'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // Recommend something different from my usual taste
  const isDifferentTasteIntent = /\b(?:recommend|suggest|give\s+me)\s+(?:something\s+)?different\s+from\s+my\s+(?:usual\s+)?taste\b/i.test(lowerMsg) ||
    /\b(?:different\s+from|outside)\s+my\s+(?:usual\s+)?taste\b/i.test(lowerMsg);
  if (isDifferentTasteIntent) {
    const userGenresLower = (preferences.favoriteGenres || []).map(g => g.toLowerCase());
    const candidates = ['Jazz', 'Classical', 'Acoustic', 'Electronic', 'Lo-Fi', 'Ambient', 'Soul', 'Indie'];
    const exploratoryGenre = candidates.find(g => !userGenresLower.includes(g.toLowerCase())) || 'Jazz';
    const exploratoryTracks = await fetchCompanionTracks({
      genre: exploratoryGenre,
      limit: 4,
      excludedIds: context.sessionTrackIds,
      excludedKeys: context.sessionTrackKeys
    });
    return {
      text: `Stepping outside your comfort zone! Here are fresh tracks exploring **${exploratoryGenre}**, distinctly different from your usual preferences:`,
      recommendations: exploratoryTracks,
      quickReplies: ['Recommend songs based on my taste', 'Show my favorite genres', 'I prefer energetic music'],
      action: null,
      contextUpdate: { lastRecommendedSongs: exploratoryTracks }
    };
  }

  // Recommend songs based on my taste
  const isTasteRecommendationIntent = /\b(?:recommend|suggest|find|give\s+me)\s+(?:some\s+)?(?:songs?|music|tracks?)\s+based\s+on\s+my\s+taste\b/i.test(lowerMsg) ||
    /\bbased\s+on\s+my\s+(?:music\s+)?taste\b/i.test(lowerMsg) ||
    /\baccording\s+to\s+my\s+taste\b/i.test(lowerMsg) ||
    /\bmere\s+taste\s+ke\s+(?:hisaab\s+se|anusar)\b/i.test(lowerMsg);
  if (isTasteRecommendationIntent) {
    const favGenres = preferences.favoriteGenres || [];
    const favArtists = preferences.favoriteArtists || [];
    const energyLevel = preferences.energyLevel || null;
    const prefMoods = preferences.preferredMoods || [];

    const hasAnyTaste = favGenres.length > 0 || favArtists.length > 0 || Boolean(energyLevel);
    if (hasAnyTaste) {
      const targetGenre = favGenres[0] || undefined;
      const targetArtist = favArtists[0] || undefined;
      const targetMood = (prefMoods.length > 0 ? prefMoods[0] : (preferences.defaultMood || 'Happy'));
      const tasteTracks = await fetchCompanionTracks({
        mood: targetMood,
        genre: targetGenre,
        artist: targetArtist,
        energy: energyLevel,
        limit: 4,
        excludedIds: context.sessionTrackIds,
        excludedKeys: context.sessionTrackKeys
      });
      const factors = [];
      if (favGenres.length > 0) factors.push(`genre: ${favGenres.join(', ')}`);
      if (favArtists.length > 0) factors.push(`artist: ${favArtists.join(', ')}`);
      if (energyLevel) factors.push(`energy: ${energyLevel}`);

      return {
        text: `Here are song recommendations personalized to your taste profile (${factors.join(', ')}):`,
        recommendations: tasteTracks,
        quickReplies: ['I want more music like my favorite artists', 'Recommend something different from my usual taste', 'Show my favorite genres'],
        action: null,
        contextUpdate: { lastRecommendedSongs: tasteTracks }
      };
    } else {
      return {
        text: "You haven't set up your music taste profile yet! Tell me your favorite genres (e.g. 'Update my preferred genres to Rock, Pop') or your energy preference, or visit your Profile page.",
        recommendations: [],
        quickReplies: ['Update my preferred genres to Pop, Rock', 'I prefer energetic music', 'Show my favorite genres'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 7E. CONTEXT-AWARE FOLLOW-UP REQUESTS (PHASE 3)

  // 7E.1 START OVER / RESET CONVERSATION CONTEXT
  const isStartOver = /\b(start\s+over|reset(\s+conversation|\s+chat|\s+context)?|clear(\s+chat)?\s+history|shuru\s+se\s+shuru\s+karo|fir\s+se\s+shuru)\b/i.test(lowerMsg);
  if (isStartOver) {
    return {
      text: isHindiOrHinglish
        ? "Maine conversation context reset kar diya hai. Ab aap naye sire se kisi bhi mood ya genre ka sangeet sun sakte hain!"
        : "Conversation context has been reset! What kind of music would you like to explore now?",
      recommendations: [],
      quickReplies: isHindiOrHinglish
        ? ['Emotional Bollywood', 'Calm and relaxing', 'Uplifting music', 'Energetic songs']
        : ['Calm and relaxing', 'Emotional Bollywood', 'Uplifting music', 'Energetic songs', 'Recommend songs based on my taste'],
      action: null,
      contextUpdate: {
        currentMood: null,
        genre: null,
        language: null,
        energy: null,
        listeningMode: null,
        recommendedTrackIds: [],
        recommendedTrackKeys: [],
        lastRecommendedSongs: [],
        lastGeneratedPlaylist: null
      }
    };
  }

  // 7E.2 MORE LIKE THE [N]TH SONG
  const moreLikeMatch = lowerMsg.match(/\b(?:more\s+(?:songs?\s+)?like|similar\s+to|like)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|\d+(?:st|nd|rd|th)?)\s+(?:song|track)\b/i) ||
    lowerMsg.match(/\bmore\s+like\s+song\s+(\d+)\b/i) ||
    lowerMsg.match(/\b(teesra|doosra|dusra|pehla|chautha)\s+gaana\s+jaisa\b/i);

  if (moreLikeMatch) {
    const rawOrdinal = (moreLikeMatch[1] || moreLikeMatch[0]).toLowerCase();
    let targetIdx = -1;
    if (/first|1st|pehla|\b1\b/.test(rawOrdinal)) targetIdx = 0;
    else if (/second|2nd|doosra|dusra|\b2\b/.test(rawOrdinal)) targetIdx = 1;
    else if (/third|3rd|teesra|\b3\b/.test(rawOrdinal)) targetIdx = 2;
    else if (/fourth|4th|chautha|\b4\b/.test(rawOrdinal)) targetIdx = 3;
    else if (/fifth|5th|\b5\b/.test(rawOrdinal)) targetIdx = 4;
    else if (/last/.test(rawOrdinal) && context.lastRecommendedSongs?.length > 0) {
      targetIdx = context.lastRecommendedSongs.length - 1;
    } else {
      const numMatch = rawOrdinal.match(/\d+/);
      if (numMatch) targetIdx = parseInt(numMatch[0], 10) - 1;
    }

    const lastSongs = Array.isArray(context.lastRecommendedSongs) ? context.lastRecommendedSongs : [];
    if (targetIdx >= 0 && targetIdx < lastSongs.length) {
      const refSong = lastSongs[targetIdx];
      const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
      const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

      const refId = String(refSong.id || refSong._id || refSong.songId || '');
      if (refId) excludedIds.add(refId);
      const { key: refKey } = normalizeTrackKey(refSong.title, refSong.artist);
      if (refKey) excludedKeys.add(refKey);

      const queryMood = refSong.mood || context.currentMood || 'Happy';
      const queryGenre = refSong.genre || context.genre;
      const queryArtist = refSong.artist;
      const queryLang = refSong.language || context.language;

      const similarTracks = await fetchCompanionTracks({
        mood: queryMood,
        genre: queryGenre,
        artist: queryArtist,
        language: queryLang,
        limit: 4,
        excludedIds,
        excludedKeys
      });

      return {
        text: isHindiOrHinglish
          ? `**${refSong.title}** (${refSong.artist}) se milte-julte kuch behtareen gaane ye rahe:`
          : `Here are tracks similar to **${refSong.title}** by ${refSong.artist} (matching its ${refSong.genre || refSong.mood || 'musical'} vibe):`,
        recommendations: similarTracks,
        quickReplies: isHindiOrHinglish
          ? ['Play the first song', 'Save this playlist', 'Kuch aur naye gaane sunao']
          : ['Play the first song', 'Save this playlist', 'Give me new songs'],
        action: null,
        contextUpdate: {
          currentMood: queryMood,
          genre: queryGenre,
          language: queryLang,
          lastRecommendedSongs: similarTracks
        }
      };
    } else {
      return {
        text: isHindiOrHinglish
          ? "Mujhe pichhle recommendations mein se wo gaana nahi mila. Kripya gaane ka naam batayein ya 'Give me new songs' kahein."
          : "I couldn't identify which song from the previous recommendations you meant. Which song would you like more tracks like?",
        recommendations: [],
        quickReplies: ['Give me new songs', 'Calm and relaxing', 'Emotional Bollywood'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 7E.3 MAKE THIS PLAYLIST MORE ENERGETIC
  const isPlaylistMoreEnergetic = /\b(make\s+(?:this\s+)?playlist\s+(?:more\s+)?energetic|turn\s+up\s+the\s+energy\s+of\s+(?:this\s+)?playlist)\b/i.test(lowerMsg);
  if (isPlaylistMoreEnergetic) {
    const pGenre = context.genre || (isHindiOrHinglish ? 'Bollywood' : undefined);
    const pLang = context.language || (isHindiOrHinglish ? 'Hindi' : undefined);
    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

    const energeticTracks = await fetchCompanionTracks({
      mood: 'Energetic',
      energy: 'energetic',
      genre: pGenre,
      language: pLang,
      limit: 6,
      excludedIds,
      excludedKeys
    });

    const title = `${pGenre || 'Mood'} High Energy Journey`;
    return {
      text: isHindiOrHinglish
        ? `Playlist ki energy badha di gayi hai! Ye rahe high-tempo aur upbeat gaane:`
        : `Turned up the energy of your playlist! Here is a more energetic selection matching your vibe:`,
      recommendations: energeticTracks,
      quickReplies: ['Play the first song', `Save this playlist as ${title}`, 'Something softer'],
      action: {
        type: 'QUEUE_PLAYLIST',
        songs: energeticTracks,
        title,
        autoplay: false
      },
      contextUpdate: {
        currentMood: 'Energetic',
        energy: 'energetic',
        lastRecommendedSongs: energeticTracks,
        lastGeneratedPlaylist: { name: title, songs: energeticTracks }
      }
    };
  }

  // 7E.4 KEEP GENRE BUT CHANGE MOOD
  const moodChangeMatch = lowerMsg.match(/\b(?:keep\s+(?:the\s+)?genre\s+(?:but\s+)?change\s+(?:the\s+)?mood(?:\s+to\s+([a-z]+))?|change\s+(?:the\s+)?mood\s+to\s+([a-z]+))\b/i);
  if (moodChangeMatch) {
    const rawMood = (moodChangeMatch[1] || moodChangeMatch[2] || '').trim();
    let newMood = 'Calm';
    if (/happy|joy|cheerful/i.test(rawMood)) newMood = 'Happy';
    else if (/sad|emotional|melancholic/i.test(rawMood)) newMood = 'Sad';
    else if (/energetic|party|fast/i.test(rawMood)) newMood = 'Energetic';
    else if (/romantic|love/i.test(rawMood)) newMood = 'Romantic';
    else if (/calm|relax/i.test(rawMood)) newMood = 'Calm';
    else {
      newMood = context.currentMood === 'Sad' ? 'Calm' : (context.currentMood === 'Calm' ? 'Happy' : 'Calm');
    }

    const preservedGenre = context.genre || (isHindiOrHinglish ? 'Bollywood' : undefined);
    const preservedLang = context.language || (isHindiOrHinglish ? 'Hindi' : undefined);
    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

    const tracks = await fetchCompanionTracks({
      mood: newMood,
      genre: preservedGenre,
      language: preservedLang,
      limit: 4,
      excludedIds,
      excludedKeys
    });

    return {
      text: isHindiOrHinglish
        ? `Aapka genre (${preservedGenre || 'favorites'}) barkarar rakhte hue mood ko **${newMood}** mein badal diya hai:`
        : `Kept your genre (${preservedGenre || 'favorites'}) and shifted the mood to **${newMood}**:`,
      recommendations: tracks,
      quickReplies: ['Play the first song', 'Save this playlist', 'Give me new songs', 'Something softer'],
      action: null,
      contextUpdate: {
        currentMood: newMood,
        genre: preservedGenre,
        language: preservedLang,
        lastRecommendedSongs: tracks
      }
    };
  }

  // 7E.5 LANGUAGE SWITCH FOLLOW-UP ("Hindi songs instead", "English songs instead")
  const langSwitchMatch = lowerMsg.match(/\b(hindi|english|punjabi|spanish)\s+(?:songs?|tracks?|music)?\s*(?:instead|chahiye|sunao|karo)\b/i) ||
    lowerMsg.match(/\b(?:switch\s+to|change\s+to)\s+(hindi|english|punjabi|spanish)\b/i);

  if (langSwitchMatch) {
    const requestedLangRaw = (langSwitchMatch[1] || '').toLowerCase();
    const newLang = requestedLangRaw.charAt(0).toUpperCase() + requestedLangRaw.slice(1);
    
    // Preserve current mood and energy
    const preservedMood = context.currentMood || 'Happy';
    const preservedEnergy = context.energy || undefined;
    let queryGenre = context.genre;
    if (newLang === 'Hindi' && (!queryGenre || queryGenre === 'Pop' || queryGenre === 'Rock')) {
      queryGenre = 'Bollywood';
    }

    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

    const langTracks = await fetchCompanionTracks({
      mood: preservedMood,
      genre: queryGenre,
      language: newLang,
      energy: preservedEnergy,
      limit: 4,
      excludedIds,
      excludedKeys
    });

    return {
      text: isHindiOrHinglish
        ? `Aapke liye ${newLang} gaano par switch kar diya hai, jabki aapka ${preservedMood} mood aur energy vibe barkarar hai:`
        : `Switched to ${newLang} songs for you while preserving your current ${preservedMood} mood and energy level:`,
      recommendations: langTracks,
      quickReplies: ['Play the first song', 'Save this playlist', 'Give me new songs', 'Something softer'],
      action: null,
      contextUpdate: {
        currentMood: preservedMood,
        genre: queryGenre,
        language: newLang,
        energy: preservedEnergy,
        lastRecommendedSongs: langTracks
      }
    };
  }

  // 7E.6 FASTER SONGS FOLLOW-UP ("Give me faster songs", "Something faster")
  const isFasterFollowUp = /\b(faster(\s+(?:songs?|tracks?|music|gaane|beats?))?|give\s+me\s+faster\s+(?:songs?|tracks?|music|gaane)|something\s+faster|increase\s+tempo|speed\s+it\s+up|make\s+it\s+faster|tez\s+gaane|tezz\s+sunao)\b/i.test(lowerMsg);
  if (isFasterFollowUp) {
    const preservedGenre = context.genre || (isHindiOrHinglish ? 'Bollywood' : undefined);
    const preservedLang = context.language || (isHindiOrHinglish ? 'Hindi' : undefined);
    const newEnergy = 'energetic';
    const newMood = 'Energetic';

    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

    const fasterTracks = await fetchCompanionTracks({
      mood: newMood,
      energy: newEnergy,
      genre: preservedGenre,
      language: preservedLang,
      limit: 4,
      excludedIds,
      excludedKeys
    });

    return {
      text: isHindiOrHinglish
        ? `Tempo aur energy badha di hai! Ye rahe tez aur energetic gaane:${preservedGenre ? ` (${preservedGenre})` : ''}`
        : `Turning up the tempo! Here are faster, higher-energy songs while keeping your ${preservedGenre ? `${preservedGenre} ` : ''}vibe:`,
      recommendations: fasterTracks,
      quickReplies: ['Play the first song', 'Save this playlist', 'Give me new songs', 'Something softer'],
      action: null,
      contextUpdate: {
        currentMood: newMood,
        energy: newEnergy,
        genre: preservedGenre,
        language: preservedLang,
        lastRecommendedSongs: fasterTracks
      }
    };
  }

  // 7E.7 SOFTER / CALMER SONGS FOLLOW-UP ("Something softer", "Softer songs")
  const isSofterFollowUp = /\b(softer(\s+(?:songs?|tracks?|music|gaane))?|something\s+softer|calmer(\s+(?:songs?|tracks?|music|gaane))?|something\s+calmer|more\s+peaceful|lower\s+energy|dheeme\s+gaane|thoda\s+shaant|sukoon\s+bhare)\b/i.test(lowerMsg);
  if (isSofterFollowUp) {
    const preservedGenre = context.genre || (isHindiOrHinglish ? 'Bollywood' : undefined);
    const preservedLang = context.language || (isHindiOrHinglish ? 'Hindi' : undefined);
    const newEnergy = 'calm';
    const newMood = 'Calm';

    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));

    const softerTracks = await fetchCompanionTracks({
      mood: newMood,
      energy: newEnergy,
      genre: preservedGenre,
      language: preservedLang,
      limit: 4,
      excludedIds,
      excludedKeys
    });

    return {
      text: isHindiOrHinglish
        ? `Sangeet ko shaant aur soothing kar diya hai. Ye rahe sukoon bhare gaane:${preservedGenre ? ` (${preservedGenre})` : ''}`
        : `Softening the vibe. Here are calmer, lower-energy songs matching your ${preservedGenre ? `${preservedGenre} ` : ''}sound:`,
      recommendations: softerTracks,
      quickReplies: ['Play the first song', 'Save this playlist', 'Give me new songs', 'Something faster'],
      action: null,
      contextUpdate: {
        currentMood: newMood,
        energy: newEnergy,
        genre: preservedGenre,
        language: preservedLang,
        lastRecommendedSongs: softerTracks
      }
    };
  }

  // 7E.8 AMBIGUOUS REQUESTS (Requirement G in Phase 3)
  const isAmbiguous = /^(change(\s+it)?|make\s+it\s+different|something\s+else|different|play\s+something|suggest\s+something|kuch\s+bhi|badlo)[\s.!?]*$/i.test(cleanMsg);
  if (isAmbiguous) {
    if (context.currentMood || context.genre) {
      return {
        text: `How would you like to change the music? You can ask for higher energy ("Give me faster songs"), a softer sound ("Something softer"), a different language ("Hindi songs instead"), or completely fresh tracks ("Give me new songs").`,
        recommendations: [],
        quickReplies: ['Give me new songs', 'Give me faster songs', 'Something softer', 'Recommend songs based on my taste'],
        action: null,
        contextUpdate: {}
      };
    } else {
      return {
        text: "What vibe are you looking for? Tell me how you're feeling (e.g. 'Calm and relaxing' or 'Energetic songs'), or pick a vibe below:",
        recommendations: [],
        quickReplies: ['Calm and relaxing', 'Emotional Bollywood', 'Uplifting music', 'Energetic songs', 'Recommend songs based on my taste'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  // 8. SKIP OR REPLACE SONG INTENTS
  if (/\b(skip(\s+this\s+song|\s+track)?|agla\s+gaana|next\s+track|next\s+song)\b/i.test(lowerMsg)) {
    return {
      text: isHindiOrHinglish ? "Agla track play kar raha hoon." : "Playing the next track for you.",
      recommendations: [],
      quickReplies: ['Keep this vibe', 'Suggest something calmer', 'More energetic'],
      action: { type: 'PLAY_NEXT' },
      contextUpdate: {}
    };
  }

  const isReplaceSong = /\b(change\s+this\s+song|play\s+another\s+song(?:\s+with\s+the\s+same\s+vibe)?|play\s+something\s+(?:happier|calmer|more\s+energetic|different)|is\s+gaane\s+ko\s+change\s+karo)\b/i.test(lowerMsg);
  if (isReplaceSong) {
    let desiredMood = context.currentMood || 'Happy';
    if (/happier/i.test(lowerMsg)) desiredMood = 'Happy';
    if (/calmer/i.test(lowerMsg)) desiredMood = 'Calm';
    if (/energetic/i.test(lowerMsg)) desiredMood = 'Energetic';

    const currentId = context.nowPlaying ? String(context.nowPlaying._id || context.nowPlaying.id) : '';
    const currentTitle = context.nowPlaying?.title || '';
    const currentArtist = context.nowPlaying?.artist || '';
    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    if (currentId) excludedIds.add(currentId);

    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []).map(k => String(k).toLowerCase()));
    if (currentTitle) {
      const { key } = normalizeTrackKey(currentTitle, currentArtist);
      if (key) excludedKeys.add(key);
    }

    const replacementTracks = await fetchCompanionTracks({
      mood: desiredMood,
      genre: context.genre,
      language: context.language,
      limit: 3,
      excludedIds,
      excludedKeys
    });

    if (replacementTracks.length > 0) {
      const newSong = replacementTracks[0];
      return {
        text: isHindiOrHinglish
          ? `Gaana change kar diya! Ab suniye **${newSong.title}** (${newSong.artist}).`
          : `Changed! Now playing **${newSong.title}** by ${newSong.artist} (${desiredMood} vibe).`,
        recommendations: replacementTracks,
        quickReplies: ['Favorite this song', 'Play next song', 'Save this playlist'],
        action: { type: 'REPLACE_CURRENT_SONG', song: newSong },
        contextUpdate: { nowPlaying: newSong }
      };
    }
  }

  // 9. MULTI-SONG & MOOD TRANSITION PLAYLIST GENERATION (PHASE 2)
  const requestedCount = extractSongCount(cleanMsg);
  const moodProgression = extractMoodProgression(cleanMsg);

  if (moodProgression || (requestedCount && requestedCount >= 3 && /\b(playlist|journey|transition|progression)\b/i.test(lowerMsg))) {
    const targetCount = requestedCount || 10;
    const stages = moodProgression || [context.currentMood || 'Happy'];
    const transitionGenre = isHindiOrHinglish ? 'Bollywood' : context.genre;
    const transitionLang = isHindiOrHinglish ? 'Hindi' : context.language;

    const result = await generateTransitionPlaylist({
      moods: stages,
      totalCount: targetCount,
      genre: transitionGenre,
      language: transitionLang
    });

    const journeyDesc = stages.join(' → ');
    const countNote = result.actualCount === result.requestedCount
      ? `${result.actualCount} tracks`
      : `${result.actualCount} of ${result.requestedCount} verified tracks found`;

    const playlistTitle = `${journeyDesc} Journey`;
    const introText = isHindiOrHinglish
      ? `Aapke liye **${journeyDesc}** transition playlist taiyaar hai (${countNote}). Ye gaane kramashah aapke mood ko step by step guide karenge:`
      : `Here is your **${journeyDesc}** mood transition playlist (${countNote}). The tracks are sequenced in your requested emotional progression:`;

    return {
      text: introText,
      recommendations: result.tracks,
      quickReplies: [
        'Play the first song',
        `Save this playlist as ${playlistTitle}`,
        'Add this song to my favorites',
        'Keep this vibe'
      ],
      action: {
        type: 'QUEUE_PLAYLIST',
        songs: result.tracks,
        title: playlistTitle,
        autoplay: false
      },
      contextUpdate: {
        currentMood: stages[stages.length - 1],
        lastRecommendedSongs: result.tracks,
        currentQueue: result.tracks,
        lastGeneratedPlaylist: {
          name: playlistTitle,
          songs: result.tracks
        }
      }
    };
  }

  // 10. CONVERSATIONAL COMMAND: Play first / second / third song
  const isPlayFirst = /\b(play\s+(the\s+)?(first|1st|first\s+one|song\s+1|track\s+1)|pehla(\s+wala)?\s+(gaana|gana|track|song|music)|(gaana|gana|song)\s+(1|ek|pehla)|first\s+(gaana|gana|wala)|pehla\s+(chalao|bajao|bajaao|sunao)|play\s+first)\b/i.test(lowerMsg) || /(पहला\s+गाना|गाना\s+1|पहला\s+बजाओ|पहला\s+सुनाओ)/i.test(lowerMsg);
  if (isPlayFirst) {
    const songs = context.lastRecommendedSongs || [];
    if (songs.length > 0) {
      const target = songs[0];
      const startText = isHindiOrHinglish
        ? `Aapke liye **${target.title}** (${target.artist}) shuru kar raha hoon. Enjoy the music!`
        : `Starting playback for **${target.title}** by ${target.artist}. Enjoy the music!`;
      return {
        text: startText,
        recommendations: [target],
        quickReplies: isHindiOrHinglish
          ? ['Kuch shaant sunao', 'More Bollywood songs', 'Favorite me add karo']
          : ['Suggest something calmer', 'Give me more Bollywood songs', 'Add this song to my favorites'],
        action: { type: 'PLAY_SONG', song: target },
        contextUpdate: { nowPlaying: target }
      };
    } else {
      return {
        text: isHindiOrHinglish
          ? "Abhi maine koi gaane recommend nahi kiye hain. Batayein aapko kaisa mood ya sangeet sunna hai!"
          : "I haven't recommended any songs yet in this conversation. Tell me what mood or genre you'd like to hear, and I'll find some great tracks for you!",
        recommendations: [],
        quickReplies: ['Calm and relaxing', 'Emotional Bollywood', 'Uplifting music', 'Energetic songs'],
        action: null,
        contextUpdate: {}
      };
    }
  }

  const isPlaySecond = /\b(play\s+(the\s+)?(second|2nd|song\s+2|track\s+2)|(doosra|dusra|second|2nd)(\s+wala)?\s+(gaana|gana|track|song)|(doosra|dusra|2nd)\s+(chalao|bajao|bajaao|sunao))\b/i.test(lowerMsg) || /(दूसरा\s+गाना|गाना\s+2|दूसरा\s+बजाओ)/i.test(lowerMsg);
  if (isPlaySecond) {
    const songs = context.lastRecommendedSongs || [];
    if (songs.length > 1) {
      const target = songs[1];
      const playText = isHindiOrHinglish
        ? `Ab suniye **${target.title}** by ${target.artist}.`
        : `Playing **${target.title}** by ${target.artist} for you now.`;
      return {
        text: playText,
        recommendations: [target],
        quickReplies: isHindiOrHinglish
          ? ['Agla gaana bajao', 'Kuch shaant sunao', 'Favorite me add karo']
          : ['Play the next song', 'Suggest something calmer', 'Add this song to my favorites'],
        action: { type: 'PLAY_SONG', song: target },
        contextUpdate: { nowPlaying: target }
      };
    }
  }

  // 10B. CONVERSATIONAL COMMAND: Play specific song by title ("Play Tum Hi Ho", "Play Kesariya", "Tum Hi Ho bajao")
  const specificSongMatch = cleanMsg.match(/^(?:play\s+(?:the\s+)?(?:song\s+|track\s+)?["']?([^"'.!?\n]+?)["']?|["']?([^"'.!?\n]+?)["']?\s+(?:play\s*karo|chalao|bajao|bajaao|sunao))$/i);
  if (specificSongMatch) {
    const rawSongQuery = (specificSongMatch[1] || specificSongMatch[2] || '').trim().replace(/["']/g, '');
    const isExcludedQuery = /^(all|everything|music|songs?|gaane?|gana|geet|track|tracks|something|first|second|1st|2nd|next|previous|favorite|favorites|favs|new|different|more|another)$/i.test(rawSongQuery) ||
      /\b(playlist|journey)\b/i.test(rawSongQuery) ||
      /\b(sad|happy|energetic|calm|romantic|bollywood|desi|hindi|punjabi|english|pop|rock|lofi|fast|slow|relaxing|upbeat|party|dance|soothing)\b/i.test(rawSongQuery);

    if (rawSongQuery && !isExcludedQuery) {
      let matchedSong = null;
      try {
        const escaped = rawSongQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        matchedSong = await Song.findOne({ title: new RegExp(`^${escaped}$`, 'i'), isPlayable: true });
        if (!matchedSong) {
          matchedSong = await Song.findOne({ title: new RegExp(escaped, 'i'), isPlayable: true });
        }
      } catch (dbErr) {
        console.warn('DB song search error:', dbErr.message);
      }

      if (!matchedSong) {
        try {
          const itunesResults = await searchItunesByQuery(rawSongQuery, 5);
          if (itunesResults && itunesResults.length > 0) {
            const top = itunesResults[0];
            matchedSong = formatCompanionSong({
              id: top.id,
              title: top.title,
              artist: top.artist,
              cover: top.cover || top.albumArt,
              albumArt: top.albumArt || top.cover,
              audioUrl: top.audio_url || top.audioUrl || top.previewUrl,
              duration: top.duration || 30,
              genre: top.genre,
              mood: top.mood,
              language: top.language,
              provider: 'itunes',
              playbackType: 'preview',
              isPlayable: true
            });
          }
        } catch (itunesErr) {
          console.warn('iTunes song search error:', itunesErr.message);
        }
      }

      if (matchedSong) {
        const songObj = matchedSong.toObject ? formatCompanionSong(matchedSong.toObject()) : matchedSong;
        return {
          text: isHindiOrHinglish
            ? `Aapke liye **${songObj.title}** (${songObj.artist}) play kar raha hoon.`
            : `Playing **${songObj.title}** by ${songObj.artist} for you now.`,
          recommendations: [songObj],
          quickReplies: isHindiOrHinglish
            ? ['Pause', 'Agla gaana bajao', 'Favorites mein add karo']
            : ['Pause', 'Next song', 'Add to favorites'],
          action: { type: 'PLAY_SONG', song: songObj },
          contextUpdate: {
            nowPlaying: songObj,
            lastRecommendedSongs: [songObj]
          }
        };
      }
    }
  }

  // 11. MENTAL HEALTH & EMOTIONAL SUPPORT SAFETY CHECK
  const isCrisisOrSevere = /\b(suicid|kill myself|end my life|self harm|depressed|depression|hopeless|jaan de dunga|mar jaunga|khudkushi)\b/i.test(lowerMsg) || /(आत्महत्या|जान दे दूंगा|खुदकुशी)/i.test(lowerMsg);
  if (isCrisisOrSevere) {
    const calmTracks = await fetchCompanionTracks({ mood: 'Calm', genre: 'Acoustic', limit: 3 });
    const crisisMsg = isHindiOrHinglish
      ? "Main samajh sakta hoon ki yeh waqt aapke liye kaafi mushkil hai. Main yahan aapka music companion hoon jo sukoon bhare gaane de sakta hai, par main ek AI hoon aur mental health diagnose nahi kar sakta. Kripya dhyan rakhein ki aap akele nahi hain—apne kisi kareebi dost, parivaar ya counselor se zaroor baat karein. Aapke sukoon ke liye ye kuch shaant dhunein pesh hain."
      : "I'm so sorry you're going through such a heavy time. While I'm here as your music companion to provide soothing songs and emotional comfort, I am an AI and cannot diagnose emotions or mental health conditions. Please remember you don't have to carry this alone—please consider talking with a close friend, family member, or professional counselor. Here are some gentle, calming tracks to bring a little warmth right now.";
    return {
      text: crisisMsg,
      recommendations: calmTracks,
      quickReplies: ['Play the first song', 'Something softer', 'Let me explain my mood'],
      action: null,
      contextUpdate: { currentMood: 'Calm', lastRecommendedSongs: calmTracks }
    };
  }

  // 12. VAGUE LOW MOOD & CONVERSATIONAL PROMPTS
  const isVagueLowMood = /^(i('?m| am)\s+)?(feeling\s+)?(low|sad|down|not good|a bit low)(\s+today)?[\s.!?]*$/i.test(lowerMsg) ||
    /^(aaj\s+)?(mood\s+kharab\s+hai|udaas\s+hoon|udas\s+hoon|dil\s+toot\s+gaya|man\s+nahi\s+lag\s+raha|low\s+feel\s+ho\s+raha)[\s.!?]*$/i.test(lowerMsg) ||
    /(आज\s+मन\s+उदास\s+है|उदास\s+हूँ|दुखी\s+हूँ)/i.test(lowerMsg);

  if (isVagueLowMood) {
    if (isHindiOrHinglish) {
      return {
        text: "Mujhe dukh hai ki aaj ka din thoda mushkil raha hai. Aap abhi kis tarah ka sangeet sunna pasand karenge?",
        recommendations: [],
        quickReplies: [
          'Shaant aur sukoon bhare',
          'Emotional Bollywood',
          'Uplifting gaane',
          'Energetic songs',
          'Apna mood explain karein'
        ],
        action: null,
        contextUpdate: { currentMood: 'Sad', language: 'Hindi', genre: 'Bollywood' }
      };
    }
    return {
      text: "I'm sorry today has been difficult. What would you prefer to listen to right now?",
      recommendations: [],
      quickReplies: [
        'Calm and relaxing',
        'Emotional Bollywood',
        'Uplifting music',
        'Energetic songs',
        'Let me explain my mood'
      ],
      action: null,
      contextUpdate: { currentMood: 'Sad' }
    };
  }

  // 13. KEEP THIS VIBE
  if (/keep this vibe|yehi vibe rakho/i.test(lowerMsg)) {
    const vibeMood = context.currentMood || 'Happy';
    const excludedIds = new Set(Array.from(context.sessionTrackIds || []));
    const excludedKeys = new Set(Array.from(context.sessionTrackKeys || []));
    if (Array.isArray(context.lastRecommendedSongs)) {
      context.lastRecommendedSongs.forEach(t => {
        const id = String(t.id || t._id || t.songId || '');
        if (id) excludedIds.add(id);
        const { key } = normalizeTrackKey(t.title, t.artist);
        if (key) excludedKeys.add(key);
      });
    }
    const tracks = await fetchCompanionTracks({
      mood: vibeMood,
      genre: context.genre,
      language: context.language,
      limit: 6,
      excludedIds,
      excludedKeys
    });
    return {
      text: isHindiOrHinglish
        ? `Is ${vibeMood} vibe ko banaye rakhte hue, ye rahe aur gaane:`
        : `Keeping the ${vibeMood} vibe going! Here are more songs that match this flow:`,
      recommendations: tracks,
      quickReplies: ['Play the first song', 'Suggest something calmer', 'More energetic', 'Save this playlist'],
      action: null,
      contextUpdate: { lastRecommendedSongs: tracks }
    };
  }

  // 14. AI PROVIDER INTEGRATION (When configured and not in test environment)
  const hasAIProvider = process.env.NODE_ENV !== 'test' && Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  if (hasAIProvider) {
    try {
      const aiPrompt = `User said: "${cleanMsg}"\nContext: currentMood=${context.currentMood || 'None'}, genre=${context.genre || 'None'}, artist=${context.artist || 'None'}\n\nAnalyze the user message (which may be in English, Hindi, or Hinglish). Extract their desired mood, genre, language, artist, songCount (integer or 5), and write a warm, empathetic response in the user's language/tone introducing the songs. Do NOT claim medical/psychological diagnosis. Return ONLY valid JSON with keys: {"isMusicRelated": true, "targetMood": "Happy"|"Sad"|"Calm"|"Energetic"|"Romantic"|null, "targetGenre": "Bollywood"|"Pop"|"Rock"|"Acoustic"|"Classical"|null, "targetLanguage": "Hindi"|"English"|"Punjabi"|null, "targetArtist": string|null, "songCount": number|null, "conversationalReply": string, "quickReplies": ["...", "..."]}`;

      const aiResult = await callAIJson(aiPrompt, "You are Moodify AI's empathetic music companion. You understand English, Hindi, and Hinglish. Always respond with valid JSON.");

      if (aiResult && aiResult.data && typeof aiResult.data === 'object' && aiResult.data.isMusicRelated !== false) {
        const d = aiResult.data;
        const mood = d.targetMood || context.currentMood || preferences.defaultMood || 'Happy';
        const genre = d.targetGenre || (isHindiOrHinglish ? 'Bollywood' : context.genre);
        const language = d.targetLanguage || (isHindiOrHinglish ? 'Hindi' : context.language);
        const artist = d.targetArtist || null;
        const count = Math.min(20, Math.max(2, d.songCount || requestedCount || 6));

        const tracks = await fetchCompanionTracks({
          mood,
          genre,
          language,
          artist,
          limit: count
        });

        return {
          text: d.conversationalReply || (isHindiOrHinglish
            ? `Ye rahe aapke mood ke liye chune hue behtareen gaane:`
            : `Here are some wonderful ${mood} recommendations tailored for your listening:`),
          recommendations: tracks,
          quickReplies: Array.isArray(d.quickReplies) && d.quickReplies.length > 0
            ? d.quickReplies
            : (isHindiOrHinglish
              ? ['Play the first song', 'Save this playlist', 'Kuch shaant sunao', 'Keep this vibe']
              : ['Play the first song', 'Save this playlist', 'Suggest something calmer', 'Keep this vibe']),
          action: null,
          contextUpdate: {
            currentMood: mood,
            genre,
            language,
            artist,
            lastRecommendedSongs: tracks,
            lastGeneratedPlaylist: { name: `${mood} Vibes`, songs: tracks }
          }
        };
      }
    } catch (aiErr) {
      console.warn('AI Companion processing fallback to rule engine:', aiErr.message);
    }
  }

  // 15. RULE-BASED MULTILINGUAL INTENT & CONTEXT RESOLUTION (Default / Offline)
  let targetMood = context.currentMood || null;
  let targetGenre = context.genre || null;
  let targetLanguage = context.language || null;
  let targetEnergy = context.energy || null;
  let targetArtist = null;

  // Mood and Energy detection
  if (/\b(calm|calmer|relaxing|softer|peaceful|sukoon|shanti|shaant|shant|aram|aaram|neend|padhai|dhyan)\b/i.test(lowerMsg) || /(शांत|सुकून|आराम|शांति|नींद)/i.test(lowerMsg)) {
    targetMood = 'Calm';
    targetEnergy = 'calm';
  } else if (/\b(energetic|upbeat|party|hype|high energy|workout|gym|josh|dhamaka|dhamakedar|fast|masti|nachne|kasrat)\b/i.test(lowerMsg) || /(ऊर्जा|जोश|धमाका|नाच)/i.test(lowerMsg)) {
    targetMood = 'Energetic';
    targetEnergy = 'energetic';
  } else if (/\b(low|sad|heartbroken|unhappy|down|crying|udaas|udas|dukhi|gham|gam|dard|toota\s*dil|dil\s*toot)\b/i.test(lowerMsg) || /(उदास|दुख|दर्द|गम|टूटा\s*दिल)/i.test(lowerMsg)) {
    targetMood = 'Sad';
    targetEnergy = 'low';
  } else if (/\b(happy|uplifting|cheerful|joy|khush|khushi|anand|prasann|mast|badiya)\b/i.test(lowerMsg) || /(खुश|खुशी|आनंद|प्रसन्न)/i.test(lowerMsg)) {
    targetMood = 'Happy';
    targetEnergy = 'medium';
  } else if (/\b(romantic|love|pyaar|pyar|ishq|mohabbat|dil|prem)\b/i.test(lowerMsg) || /(रोमांटिक|प्यार|इश्क|मोहब्बत)/i.test(lowerMsg)) {
    targetMood = 'Romantic';
    targetEnergy = 'calm';
  }

  // Genre and Language detection independently
  if (/\b(bollywood|desi)\b/i.test(lowerMsg)) {
    targetGenre = 'Bollywood';
    targetLanguage = 'Hindi';
  } else if (/\b(punjabi)\b/i.test(lowerMsg)) {
    targetGenre = 'Punjabi';
    targetLanguage = 'Punjabi';
  } else if (/\b(pop)\b/i.test(lowerMsg)) {
    targetGenre = 'Pop';
  } else if (/\b(rock)\b/i.test(lowerMsg)) {
    targetGenre = 'Rock';
  } else if (/\b(ambient|acoustic)\b/i.test(lowerMsg)) {
    targetGenre = 'Acoustic';
  } else if (/\b(lofi|lo-fi)\b/i.test(lowerMsg)) {
    targetGenre = 'Lo-Fi';
  }

  if (/\b(hindi)\b/i.test(lowerMsg)) {
    targetLanguage = 'Hindi';
    if (!targetGenre) targetGenre = 'Bollywood';
  } else if (/\b(english)\b/i.test(lowerMsg)) {
    targetLanguage = 'English';
  }

  if (isHindiOrHinglish) {
    if (!targetLanguage) targetLanguage = 'Hindi';
    if (!targetGenre) targetGenre = 'Bollywood';
  }

  // Check artists
  if (/\barijit(\s+singh)?\b/i.test(lowerMsg) || /अरिजीत/i.test(lowerMsg)) {
    targetArtist = 'Arijit Singh';
    targetLanguage = 'Hindi';
    targetGenre = 'Bollywood';
  } else if (/\bpritam\b/i.test(lowerMsg) || /प्रीतम/i.test(lowerMsg)) {
    targetArtist = 'Pritam';
    targetLanguage = 'Hindi';
    targetGenre = 'Bollywood';
  } else if (/\bshreya(\s+ghoshal)?\b/i.test(lowerMsg) || /श्रेया/i.test(lowerMsg)) {
    targetArtist = 'Shreya Ghoshal';
    targetLanguage = 'Hindi';
    targetGenre = 'Bollywood';
  } else if (/\bbadshah\b/i.test(lowerMsg)) {
    targetArtist = 'Badshah';
    targetLanguage = 'Hindi';
    targetGenre = 'Bollywood';
  } else if (/\batif(\s+aslam)?\b/i.test(lowerMsg)) {
    targetArtist = 'Atif Aslam';
    targetLanguage = 'Hindi';
    targetGenre = 'Bollywood';
  } else if (/\bmaroon\s*5\b/i.test(lowerMsg)) {
    targetArtist = 'Maroon 5';
  } else if (/\bsidhu\b/i.test(lowerMsg)) {
    targetArtist = 'Sidhu Moose Wala';
    targetLanguage = 'Punjabi';
  }

  // Preferences fallback
  if (!targetGenre && preferences.favoriteGenres && preferences.favoriteGenres.length > 0) {
    targetGenre = preferences.favoriteGenres[0];
  }
  if (!targetLanguage && preferences.preferredLanguages && preferences.preferredLanguages.length > 0) {
    targetLanguage = preferences.preferredLanguages[0];
  }
  if (!targetMood && !targetGenre && !targetArtist) {
    targetMood = preferences.defaultMood || 'Happy';
  }

  const isNew = isNewSongsRequest(cleanMsg);
  const isNever = isNeverRecommendedBefore(cleanMsg);

  const excludedIds = new Set();
  const excludedKeys = new Set();

  // If user requests songs never recommended before, exclude all user historical tracks
  if (isNever && Array.isArray(context.userHistoricalIds)) {
    context.userHistoricalIds.forEach(id => excludedIds.add(String(id)));
  }
  if (isNever && Array.isArray(context.userHistoricalKeys)) {
    context.userHistoricalKeys.forEach(k => excludedKeys.add(String(k).toLowerCase()));
  }

  // Always exclude tracks already recommended in the current chat session
  if (Array.isArray(context.sessionTrackIds)) {
    context.sessionTrackIds.forEach(id => excludedIds.add(String(id)));
  }
  if (Array.isArray(context.sessionTrackKeys)) {
    context.sessionTrackKeys.forEach(k => excludedKeys.add(String(k).toLowerCase()));
  }

  // Also exclude current lastRecommendedSongs
  if (Array.isArray(context.lastRecommendedSongs)) {
    context.lastRecommendedSongs.forEach(t => {
      const id = String(t.id || t._id || t.songId || '');
      if (id) excludedIds.add(id);
      const { key } = normalizeTrackKey(t.title, t.artist);
      if (key) excludedKeys.add(key);
    });
  }

  const finalLimit = requestedCount || 6;
  const tracks = await fetchCompanionTracks({
    mood: targetMood,
    genre: targetGenre,
    language: targetLanguage,
    artist: targetArtist,
    energy: targetEnergy,
    limit: finalLimit,
    excludedIds,
    excludedKeys
  });

  let responseText = '';
  if (tracks.length === 0) {
    responseText = isHindiOrHinglish
      ? "Maine aapke liye naye gaane khojne ki koshish ki, lekin is criteria ke anusaar catalog mein aur naye gaane uplabdh nahi hain. Kripya koi alag mood ya genre try karein!"
      : "I searched for tracks you haven't received before, but the catalog has no further new tracks matching this criteria. Try exploring a different genre or mood!";
  } else if (tracks.length < finalLimit && (requestedCount || isNew || isNever)) {
    // Honest partial result reporting when fewer unique tracks exist than requested
    responseText = isHindiOrHinglish
      ? `Aapke liye ${tracks.length} naye gaane mile (catalog mein aur gaane uplabdh nahi hain):`
      : `Found ${tracks.length} new song(s) matching your criteria (catalog has no further new tracks):`;
  } else if (isNew || isNever) {
    responseText = isHindiOrHinglish
      ? `Ye rahe aapke liye ${tracks.length} naye gaane jo pehle recommend nahi kiye gaye the:`
      : `Here are ${tracks.length} new songs for you that haven't been recommended yet:`;
  } else if (isHindiOrHinglish) {
    if (targetMood === 'Sad') {
      responseText = "Aapke dil ko thoda sukoon aur comfort dene ke liye ye emotional Bollywood gaane hain. Sangeet dil ka bojh halka karne mein madad karta hai:";
    } else if (targetMood === 'Calm') {
      responseText = "Aapke sukoon aur relaxation ke liye ye shaant aur soothing dhunein pesh hain:";
    } else if (targetMood === 'Energetic') {
      responseText = "Mood aur energy boost karne ke liye ye high-tempo aur upbeat gaane:";
    } else if (targetMood === 'Romantic') {
      responseText = "Dil ko chhoo lene wale behtareen romantic gaane aapke liye:";
    } else if (targetGenre === 'Bollywood') {
      responseText = "Bollywood ke kuch sabse khoobsurat aur lokpriya gaane aapke liye:";
    } else {
      responseText = `Aapke mood ke anusaar ye ${targetMood || 'music'} recommendations chuni gayi hain:`;
    }
  } else {
    if (targetMood === 'Sad') {
      responseText = "Here are some emotional and comforting tracks to accompany your feelings. Music has a gentle way of holding space when words aren't enough.";
    } else if (targetMood === 'Calm') {
      responseText = "Here are soothing, peaceful tracks to help you unwind and breathe easy:";
    } else if (targetMood === 'Energetic') {
      responseText = "Turning up the energy! Here are high-tempo tracks to give you an extra boost:";
    } else if (targetGenre === 'Bollywood') {
      responseText = "Here are some of the finest Bollywood melodies handpicked for you:";
    } else {
      responseText = `Here are some wonderful ${targetMood || 'music'} recommendations tailored for your listening:`;
    }
  }

  const defaultTitle = `${targetMood || 'Mood'} Mix`;
  return {
    text: responseText,
    recommendations: tracks,
    quickReplies: isHindiOrHinglish
      ? [
        'Play the first song',
        `Save this playlist as ${defaultTitle}`,
        'Kuch shaant sunao',
        'Keep this vibe'
      ]
      : [
        'Play the first song',
        `Save this playlist as ${defaultTitle}`,
        'Suggest something calmer',
        'Keep this vibe'
      ],
    action: null,
    contextUpdate: {
      currentMood: targetMood,
      genre: targetGenre,
      language: targetLanguage,
      energy: targetEnergy,
      lastRecommendedSongs: tracks,
      lastGeneratedPlaylist: { name: defaultTitle, songs: tracks }
    }
  };
};
