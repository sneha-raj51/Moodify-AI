import Song from '../models/Song.js';

/**
 * Service to manage legitimate full-length music playback via the official
 * YouTube IFrame Player API and YouTube Data API v3.
 * 
 * Complies with YouTube Terms of Service:
 * - Plays official music videos / official audio tracks directly within the official IFrame player.
 * - Does not scrape, download, or extract audio streams.
 * - Provides full artist attribution and official YouTube playback links.
 */

// In-memory cache for resolved YouTube video IDs
const videoIdCache = new Map();

/**
 * Resolves or searches a YouTube video ID for a given track.
 * Checks memory cache -> MongoDB -> YouTube Data API (if key present) -> oEmbed/search fallback.
 */
export const resolveYouTubeVideo = async (title, artist) => {
  if (!title) return null;

  const cacheKey = `${artist || ''} - ${title}`.toLowerCase().trim();
  if (videoIdCache.has(cacheKey)) {
    return videoIdCache.get(cacheKey);
  }

  // Verified YouTube video IDs for popular catalog tracks
  const verifiedMap = {
    'kesariya': 'BddP6PYo2gs',
    'tum hi ho': 'IJq0ydzBu-M',
    'channa mereya': 'bzSTpdcs-EI',
    'badtameez dil': 'II2EO3NwUrQ',
    'raataan lambiyan': 'gvyUuxdRdR4',
    'brown munde': 'VNs_cCtdbPc',
    'amplifier': 'uuCFRaFWjwY',
    'ghungroo': 'qFkNATtc3mc',
    'agar tum saath ho': 'sK7riqg2mr4',
    'baarishein': 'PJWemSzExXs',
    'lag ja gale': 'TFr6G5zveS8',
    'pal pal dil ke paas': 'dZ_M4XF_8_E',
    'someone like you': 'hLQl3WQQoQ0',
    'midnight city': 'dX3k_QDnzHE',
    'walking on sunshine': 'iPUmE-46A88',
    'bohemian rhapsody': 'fJ9rUzIMcZQ',
    "don't stop me now": 'HgzGwKwLmgM',
    'weightless': 'UfcAVejslrU',
    'clair de lune': 'WNcsUNKlAKw',
    'holocene': 'TWcyIpul8OE',
    'blinding lights': '4NRXx6U8ABQ',
    'shape of you': 'JGwWNGJdvx8',
    'kala chashma': 'k4yXQkGLeAA'
  };

  const normTitle = title.toLowerCase().trim();
  for (const [key, vId] of Object.entries(verifiedMap)) {
    if (normTitle.includes(key) || key.includes(normTitle)) {
      const res = {
        youtubeId: vId,
        source: 'verified-catalog',
        externalUrl: `https://www.youtube.com/watch?v=${vId}`
      };
      videoIdCache.set(cacheKey, res);
      return res;
    }
  }

  // 1. Check MongoDB if we already have a cached YouTube ID for this song
  try {
    const existingSong = await Song.findOne({
      title: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      youtubeId: { $exists: true, $ne: null }
    }).select('youtubeId title artist').lean();

    if (existingSong && existingSong.youtubeId) {
      const result = {
        youtubeId: existingSong.youtubeId,
        source: 'database',
        externalUrl: `https://www.youtube.com/watch?v=${existingSong.youtubeId}`
      };
      videoIdCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('DB lookup error for YouTube video:', err.message);
  }

  // 2. If YOUTUBE_API_KEY is configured, use official YouTube Data API v3
  const apiKey = process.env.YOUTUBE_API_KEY;
  const searchQuery = `${artist ? `${artist} ` : ''}${title} official audio`;

  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          const youtubeId = item.id?.videoId;
          if (youtubeId) {
            const result = {
              youtubeId,
              title: item.snippet?.title || title,
              cover: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url,
              channelTitle: item.snippet?.channelTitle,
              source: 'youtube-api',
              externalUrl: `https://www.youtube.com/watch?v=${youtubeId}`
            };
            videoIdCache.set(cacheKey, result);

            // Cache in DB if matching song found
            Song.updateOne(
              { title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
              { $set: { youtubeId, externalUrl: result.externalUrl, playbackType: 'full', isPlayable: true } }
            ).catch(() => {});

            return result;
          }
        }
      } else {
        console.warn('YouTube Data API response not ok:', res.status);
      }
    } catch (err) {
      console.warn('YouTube Data API error:', err.message);
    }
  }

  // 3. Fallback: Query search string for YouTube IFrame Player
  // The official YouTube IFrame Embed player supports playlist/search query embedding or direct external links
  const result = {
    youtubeId: null,
    searchQuery: encodeURIComponent(`${artist ? `${artist} - ` : ''}${title}`),
    externalUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist ? `${artist} ` : ''}${title} song`)}`,
    source: 'search-query'
  };
  videoIdCache.set(cacheKey, result);
  return result;
};

/**
 * Searches YouTube for playable full-length music videos
 */
export const searchYouTubeTracks = async (query, limit = 8) => {
  if (!query || !query.trim()) return [];

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${limit}&q=${encodeURIComponent(`${query.trim()} song`)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`YouTube search error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) return [];

    return data.items
      .filter(item => item.id?.videoId)
      .map(item => {
        const videoId = item.id.videoId;
        const snippet = item.snippet;
        const thumbnail = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url;
        
        // Parse Title / Artist if possible from video title
        let title = snippet.title || 'Unknown Title';
        let artist = snippet.channelTitle || 'YouTube Artist';
        
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').replace(/\(Official.*?\)|\[Official.*?\]/gi, '').trim();
        }

        return {
          _id: `yt_${videoId}`,
          id: `yt_${videoId}`,
          youtubeId: videoId,
          title,
          artist,
          album: snippet.channelTitle || 'YouTube Music',
          albumArt: thumbnail,
          cover: thumbnail,
          audioUrl: null,
          isPlayable: true,
          isPreview: false,
          playbackType: 'full',
          duration: 240, // standard song average
          genre: 'Pop',
          mood: 'Neutral',
          provider: 'youtube',
          externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
          explanation: 'Full-length track available via official YouTube Player.'
        };
      });
  } catch (error) {
    console.error('searchYouTubeTracks Error:', error.message);
    return [];
  }
};
