const JAMENDO_API_BASE = 'https://api.jamendo.com/v3.0';

let jamendoStatus = 'missing';

export const getJamendoStatus = () => {
  if (!process.env.JAMENDO_CLIENT_ID) {
    return 'missing';
  }
  return jamendoStatus === 'missing' ? 'unknown' : jamendoStatus;
};

/**
 * Normalizes a Jamendo API track into the standard Moodify song structure
 */
export const normalizeJamendoTrack = (track, queryMood = null, queryGenre = null) => {
  if (!track || !track.id) return null;

  const artwork = track.image || track.album_image || null;
  const audioUrl = track.audio || track.audiodownload || null;
  if (!audioUrl) return null;

  const durationSeconds = typeof track.duration === 'number' && track.duration > 0
    ? Math.round(track.duration)
    : 180;

  const genre = track.musicinfo?.tags?.genres?.[0] || queryGenre || 'Independent';
  const mood = queryMood || 'Neutral';
  const licenseUrl = track.license_ccurl || null;

  return {
    _id: `jamendo_${track.id}`,
    id: `jamendo_${track.id}`,
    title: track.name || 'Untitled Track',
    artist: track.artist_name || 'Jamendo Artist',
    album: track.album_name || 'Jamendo Release',
    albumArt: artwork,
    cover: artwork,
    audioUrl: audioUrl,
    previewUrl: audioUrl,
    duration: durationSeconds,
    genre: genre,
    mood: mood,
    moods: [mood],
    language: null,
    isPlayable: true,
    isPreview: false,
    isFullAudio: true,
    playbackType: 'full',
    provider: 'jamendo',
    source: 'jamendo',
    previewLabel: 'Full Track',
    sourceLabel: 'Jamendo',
    license: licenseUrl || 'Creative Commons',
    externalUrl: track.shareurl || (track.shorturl || `https://www.jamendo.com/track/${track.id}`),
    explanation: `Full-length Creative Commons track streamed via Jamendo${licenseUrl ? ` (${licenseUrl})` : ''}.`
  };
};

/**
 * Searches Jamendo for tracks matching a given mood and optional genres.
 */
export const searchJamendoTracks = async (mood, genres = [], limit = 3) => {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    jamendoStatus = 'missing';
    throw new Error('JAMENDO_CLIENT_ID is not configured');
  }

  // Map our moods to Jamendo tags
  const moodTagMap = {
    'Happy': 'happy',
    'Sad': 'sad',
    'Calm': 'calm',
    'Energetic': 'energetic',
    'Neutral': 'background',
    'Angry': 'metal',
    'Disgust': 'calm',
    'Fear': 'dark',
    'Surprise': 'electronic'
  };

  const tags = [];
  if (mood && moodTagMap[mood]) {
    tags.push(moodTagMap[mood]);
  }
  
  if (genres && genres.length > 0) {
    tags.push(genres[0].toLowerCase());
  }

  const queryParams = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: limit.toString(),
    tags: tags.join('+'),
    include: 'musicinfo+licenses',
    audioformat: 'mp32'
  });

  const url = `${JAMENDO_API_BASE}/tracks/?${queryParams.toString()}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) {
      if (response.status === 429) {
        jamendoStatus = 'rate_limit';
        throw new Error('Jamendo API rate limit exceeded');
      }
      jamendoStatus = 'failed';
      throw new Error(`Jamendo API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.headers.status !== 'success') {
      if (data.headers.warnings && data.headers.warnings.includes('Usage limits')) {
        jamendoStatus = 'rate_limit';
      } else {
        jamendoStatus = 'failed';
      }
      throw new Error(`Jamendo API returned error: ${data.headers.error_message || data.headers.warnings}`);
    }
    
    if (data.headers.warnings && data.headers.warnings.includes('Usage limits')) {
      jamendoStatus = 'rate_limit';
      throw new Error(`Jamendo API returned warning: ${data.headers.warnings}`);
    }

    if (data.results && data.results.length > 0) {
      jamendoStatus = 'connected';
    } else if (jamendoStatus === 'unknown') {
      jamendoStatus = 'connected';
    }

    return data.results
      .map(track => normalizeJamendoTrack(track, mood, genres?.[0]))
      .filter(Boolean);
  } catch (error) {
    console.error('Jamendo Search Error:', error.message);
    if (!jamendoStatus || jamendoStatus === 'unknown' || jamendoStatus === 'connected') {
      if (error.message.includes('rate limit') || error.message.includes('Usage limit')) {
        jamendoStatus = 'rate_limit';
      } else if (!error.message.includes('not configured')) {
        jamendoStatus = 'failed';
      }
    }
    throw error;
  }
};

/**
 * Searches Jamendo by text query
 */
export const searchJamendoByQuery = async (query, limit = 10) => {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId || !query || !query.trim()) {
    return [];
  }

  const queryParams = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    namesearch: query.trim(),
    limit: limit.toString(),
    include: 'musicinfo+licenses',
    audioformat: 'mp32'
  });

  const url = `${JAMENDO_API_BASE}/tracks/?${queryParams.toString()}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) {
      if (response.status === 429) jamendoStatus = 'rate_limit';
      return [];
    }

    const data = await response.json();
    if (data.headers?.status !== 'success' || !Array.isArray(data.results)) {
      return [];
    }

    jamendoStatus = 'connected';
    return data.results
      .map(track => normalizeJamendoTrack(track))
      .filter(Boolean);
  } catch (error) {
    console.warn('Jamendo query search error:', error.message);
    return [];
  }
};
