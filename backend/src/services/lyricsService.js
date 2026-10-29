import Song from '../models/Song.js';
import { getAIRecommendationsMultiProvider } from './aiProviderService.js';

// In-memory cache for lyrics to avoid duplicate external API calls
const lyricsCache = new Map();

/**
 * Normalizes title and artist to create consistent cache keys
 */
const getCacheKey = (title, artist) => {
  return `${(title || '').toLowerCase().trim()}:::${(artist || '').toLowerCase().trim()}`;
};

/**
 * Cleans song title for lyrics search (removes "(From ...)", "(Official Audio)", etc.)
 */
const cleanTitle = (title) => {
  if (!title) return '';
  return title
    .replace(/\(From\s+.*?\)/gi, '')
    .replace(/\[From\s+.*?\]/gi, '')
    .replace(/\(Official.*?\)/gi, '')
    .replace(/\[Official.*?\]/gi, '')
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(ft\..*?\)/gi, '')
    .replace(/\(Audio\)/gi, '')
    .replace(/\(Video\)/gi, '')
    .replace(/- Single/gi, '')
    .trim();
};

/**
 * Cleans artist name (takes primary artist if comma-separated or featured)
 */
const cleanArtist = (artist) => {
  if (!artist) return '';
  return artist
    .split(/[,&]/)[0]
    .replace(/feat\..*$/i, '')
    .replace(/ft\..*$/i, '')
    .trim();
};

/**
 * Fetches lyrics from LRCLIB API with appropriate headers and timeout
 */
const fetchFromLrclib = async (title, artist, duration = null) => {
  const cleanedTitle = cleanTitle(title);
  const primaryArtist = cleanArtist(artist);

  const queryParams = new URLSearchParams({
    track_name: cleanedTitle,
    artist_name: primaryArtist,
  });

  if (duration && duration > 0) {
    queryParams.append('duration', Math.round(duration).toString());
  }

  const url = `https://lrclib.net/api/get?${queryParams.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MoodifyAI/1.0 (https://moodify.ai; contact: dev@moodify.local)'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.plainLyrics || data.syncedLyrics) {
        return {
          plain: data.plainLyrics || null,
          synced: data.syncedLyrics || null,
          source: 'lrclib',
          lyricsAvailable: true
        };
      }
    } else if (res.status === 404) {
      // Fallback to LRCLIB general search
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${primaryArtist} ${cleanedTitle}`)}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'MoodifyAI/1.0 (https://moodify.ai; contact: dev@moodify.local)'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0) {
          const top = results[0];
          if (top.plainLyrics || top.syncedLyrics) {
            return {
              plain: top.plainLyrics || null,
              synced: top.syncedLyrics || null,
              source: 'lrclib',
              lyricsAvailable: true
            };
          }
        }
      }
    }
    return null;
  } catch (err) {
    console.warn('LRCLIB fetch failed/timeout:', err.message);
    return null;
  }
};

/**
 * Main service function to get lyrics
 */
export const getLyrics = async (title, artist, duration = null) => {
  if (!title) {
    return { plain: null, synced: null, lyricsAvailable: false, message: 'Song title is required' };
  }

  const cacheKey = getCacheKey(title, artist);
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  // 1. Check MongoDB (exact match or title match with non-empty lyrics)
  try {
    const cleaned = cleanTitle(title);
    let dbSong = await Song.findOne({
      title: new RegExp(`^${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      ...(artist ? { artist: new RegExp(`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {})
    }).select('lyrics lyricsAvailable').lean();

    if (!dbSong || !dbSong.lyrics || (!dbSong.lyrics.plain && !dbSong.lyrics.synced)) {
      // Check any entry with this title that has lyrics
      dbSong = await Song.findOne({
        title: new RegExp(`^${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        $or: [
          { 'lyrics.synced': { $exists: true, $ne: null } },
          { 'lyrics.plain': { $exists: true, $ne: null } }
        ]
      }).select('lyrics lyricsAvailable').lean();
    }

    if (dbSong && dbSong.lyrics && (dbSong.lyrics.plain || dbSong.lyrics.synced)) {
      const result = {
        plain: dbSong.lyrics.plain,
        synced: dbSong.lyrics.synced,
        source: dbSong.lyrics.source || 'database',
        lyricsAvailable: true
      };
      lyricsCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('DB lyrics check error:', err.message);
  }

  // 2. Query LRCLIB (official open lyrics library)
  let lrclibResult = await fetchFromLrclib(title, artist, duration);
  if (!lrclibResult && artist && artist.includes('&')) {
    // Try the secondary artist (e.g. Arijit Singh in "Pritam & Arijit Singh")
    const parts = artist.split('&').map(s => s.trim());
    if (parts.length > 1) {
      lrclibResult = await fetchFromLrclib(title, parts[1], duration);
    }
  }
  if (!lrclibResult) {
    // Try search with title alone
    lrclibResult = await fetchFromLrclib(title, '', duration);
  }

  if (lrclibResult) {
    lyricsCache.set(cacheKey, lrclibResult);

    // Save to DB asynchronously
    Song.updateMany(
      { title: new RegExp(`^${cleanTitle(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { $set: { lyrics: lrclibResult, lyricsAvailable: true } }
    ).catch(() => {});

    return lrclibResult;
  }

  // 3. Fallback: Check if AI provider is available to retrieve legitimate lyrics
  if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) {
    try {
      const prompt = `Return the official song lyrics for "${title}" by "${artist}". Output JSON in this exact format: {"lyrics": "..."}. If the lyrics are unknown or copyrighted beyond public quotation, output {"lyrics": null}. Only output valid JSON.`;
      const aiResponse = await getAIRecommendationsMultiProvider(prompt);
      if (aiResponse && aiResponse.ids && typeof aiResponse.ids === 'object' && aiResponse.ids.lyrics) {
        const result = {
          plain: aiResponse.ids.lyrics,
          synced: null,
          source: 'ai-verified',
          lyricsAvailable: true
        };
        lyricsCache.set(cacheKey, result);
        return result;
      }
    } catch (e) {
      console.warn('AI lyrics fallback skipped:', e.message);
    }
  }

  // 4. Clean Unavailable State
  const notFound = {
    plain: null,
    synced: null,
    lyricsAvailable: false,
    message: `Lyrics unavailable for "${title}".`
  };
  lyricsCache.set(cacheKey, notFound);
  return notFound;
};
