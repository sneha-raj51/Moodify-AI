/**
 * Audius API Music Provider Adapter
 * Connects to the decentralized Audius network for legal, full-length independent music.
 * Docs: https://docs.audius.co/api
 */

const AUDIUS_DEFAULT_GATEWAY = 'https://api.audius.co';
let cachedDiscoveryNode = null;
let lastDiscoveryNodeCheck = 0;

/**
 * Gets a healthy Audius host/gateway (defaults to official load-balanced gateway)
 */
export const getAudiusHost = async () => {
  return process.env.AUDIUS_API_BASE || AUDIUS_DEFAULT_GATEWAY;
};

/**
 * Returns current status of Audius provider
 */
export const getAudiusStatus = () => {
  return 'available';
};

/**
 * Normalizes an Audius API track object into the standard Moodify song structure
 */
export const normalizeAudiusTrack = (track, queryMood = null, queryGenre = null) => {
  if (!track || !track.id) return null;

  // Track must be playable and not deleted or stream-gated
  if (track.is_delete || track.is_streamable === false || track.is_stream_gated === true) {
    return null;
  }

  const appName = process.env.AUDIUS_APP_NAME || 'MoodifyAI';
  const trackId = String(track.id);

  // Use documented stream endpoint or direct verified stream URL
  const streamEndpoint = `https://api.audius.co/v1/tracks/${trackId}/stream?app_name=${encodeURIComponent(appName)}`;
  const streamUrl = (track.stream && track.stream.url) ? track.stream.url : streamEndpoint;

  // Artwork resolution
  const artwork = track.artwork?.['480x480'] ||
    track.artwork?.['150x150'] ||
    track.artwork?.['1000x1000'] ||
    track.cover_art ||
    null;

  const durationSeconds = typeof track.duration === 'number' && track.duration > 0
    ? Math.round(track.duration)
    : 180;

  return {
    _id: `audius_${trackId}`,
    id: `audius_${trackId}`,
    title: track.title || 'Untitled Track',
    artist: track.user?.name || track.user?.handle || 'Audius Artist',
    album: track.album_backlink || 'Audius Release',
    albumArt: artwork,
    cover: artwork,
    audioUrl: streamUrl,
    previewUrl: streamUrl,
    duration: durationSeconds,
    genre: track.genre || queryGenre || 'Independent',
    mood: track.mood || queryMood || 'Neutral',
    moods: track.mood ? [track.mood] : (queryMood ? [queryMood] : ['Neutral']),
    language: null,
    isPlayable: true,
    isPreview: false,
    isFullAudio: true,
    playbackType: 'full',
    provider: 'audius',
    source: 'audius',
    previewLabel: 'Full Track',
    sourceLabel: 'Audius',
    license: track.license || 'Audius Open Protocol',
    externalUrl: track.permalink ? `https://audius.co${track.permalink}` : `https://audius.co/tracks/${trackId}`,
    explanation: 'Full-length independent track streamed directly via Audius.'
  };
};

/**
 * Searches Audius tracks by text query or mood/genre
 */
export const searchAudiusTracks = async ({ query = '', mood = null, genre = null, limit = 10 } = {}) => {
  const appName = process.env.AUDIUS_APP_NAME || 'MoodifyAI';
  const maxLimit = Math.min(30, Math.max(1, limit));

  try {
    const host = await getAudiusHost();
    let url;

    if (query && query.trim()) {
      const params = new URLSearchParams({
        query: query.trim(),
        app_name: appName,
        limit: maxLimit.toString()
      });
      url = `${host}/v1/tracks/search?${params.toString()}`;
    } else {
      // Query trending / genre tracks
      const params = new URLSearchParams({
        app_name: appName,
        limit: maxLimit.toString()
      });
      if (genre && genre !== 'All') {
        params.append('genre', genre);
      }
      url = `${host}/v1/tracks/trending?${params.toString()}`;
    }

    const timeoutMs = process.env.NODE_ENV === 'test' ? 600 : 3500;
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      console.warn(`Audius API request returned HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.data)) {
      return [];
    }

    const validTracks = [];
    for (const raw of data.data) {
      const normalized = normalizeAudiusTrack(raw, mood, genre);
      if (normalized) {
        validTracks.push(normalized);
      }
      if (validTracks.length >= maxLimit) break;
    }

    return validTracks;
  } catch (err) {
    console.warn('Audius search error:', err.message);
    return [];
  }
};
