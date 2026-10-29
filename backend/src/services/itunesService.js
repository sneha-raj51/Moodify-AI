const ITUNES_API_BASE = 'https://itunes.apple.com/search';

/**
 * Maps mood to optimized iTunes search terms for Western and Indian music catalogs.
 */
const getMoodSearchTerms = (mood, language = 'English') => {
  const isIndian = /hindi|bollywood|punjabi|tamil|telugu|indian/i.test(language);

  if (isIndian) {
    switch (mood) {
      case 'Happy':
        return ['Bollywood Party Hits', 'Hindi Dance Songs', 'Bollywood Happy Songs'];
      case 'Sad':
        return ['Arijit Singh Sad Songs', 'Bollywood Emotional', 'Hindi Sad Melodies'];
      case 'Calm':
        return ['Bollywood Acoustic Romantic', 'Hindi Lofi Chill', 'Sufi Soul'];
      case 'Energetic':
        return ['Punjabi Party Hits', 'Bollywood Workout', 'Hindi Dance EDM'];
      case 'Angry':
        return ['Bollywood High Octane', 'Punjabi Aggressive Beat', 'Hindi Rock Energetic'];
      case 'Fear':
        return ['Bollywood Suspense Thriller', 'Mysterious Hindi Themes', 'Dark Ambient Soundscape'];
      case 'Disgust':
        return ['Indie Indian Rock', 'Raw Hindi Acoustic', 'Alternative Desi Hip Hop'];
      case 'Surprise':
        return ['Bollywood Dance Surprise', 'Fast EDM Punjabi', 'High Energy Desi Fusion'];
      case 'Neutral':
      default:
        return ['Bollywood Top Hits', 'Hindi Pop Hits', 'Bollywood Romance'];
    }
  }

  // Western / English
  switch (mood) {
    case 'Happy':
      return ['upbeat feel good pop', 'summer dance pop', 'happy hits'];
    case 'Sad':
      return ['acoustic sad songs', 'melancholic piano acoustic', 'heartbreak pop'];
    case 'Calm':
      return ['acoustic relaxation', 'ambient chillout', 'peaceful piano'];
    case 'Energetic':
      return ['workout electronic dance', 'high energy rock', 'edm festival'];
    case 'Angry':
      return ['hard rock intense', 'heavy metal rage', 'angst punk rock'];
    case 'Fear':
      return ['dark ambient cinematic', 'suspense soundtrack', 'eerie atmospheric soundscape'];
    case 'Disgust':
      return ['grungy alternative rock', 'rebellious punk', 'raw acoustic blues'];
    case 'Surprise':
      return ['exciting electronic drops', 'fast upbeat pop', 'unexpected energetic beats'];
    case 'Neutral':
    default:
      return ['indie acoustic pop', 'popular modern hits', 'lo-fi beats'];
  }
};

/**
 * Searches iTunes for tracks with automatic store selection (IN for Indian music, US for global).
 */
const fetchItunesStore = async (term, country = 'US', limit = 15) => {
  const queryParams = new URLSearchParams({
    term: term.trim(),
    country: country,
    media: 'music',
    entity: 'song',
    limit: limit.toString(),
  });

  const url = `${ITUNES_API_BASE}?${queryParams.toString()}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) {
      console.warn(`iTunes API error (${country}): ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) return [];

    return data.results
      .filter(track => track.previewUrl) // Must have playable 30s preview
      .map(track => {
        const highResArtwork = track.artworkUrl100
          ? track.artworkUrl100.replace('100x100bb', '600x600bb')
          : null;

        const durationSeconds = track.trackTimeMillis 
          ? Math.round(track.trackTimeMillis / 1000) 
          : 30;

        const isBollywood = /bollywood|hindi|punjabi|tamil|telugu|filmi/i.test(track.primaryGenreName) ||
          country === 'IN';

        return {
          _id: `itunes_${track.trackId}`,
          id: `itunes_${track.trackId}`,
          title: track.trackName,
          artist: track.artistName,
          album: track.collectionName || 'Single',
          albumArt: highResArtwork,
          cover: highResArtwork,
          audioUrl: track.previewUrl,
          previewUrl: track.previewUrl,
          isPlayable: true,
          isPreview: true,
          playbackType: 'preview',
          duration: durationSeconds,
          genre: track.primaryGenreName || 'Pop',
          language: isBollywood ? 'Hindi' : 'English',
          source: 'itunes',
          provider: 'itunes',
          externalUrl: track.trackViewUrl,
          explanation: `Verified Apple Music preview from ${country === 'IN' ? 'Indian' : 'Global'} catalog.`
        };
      });
  } catch (err) {
    console.warn(`iTunes fetch error for ${term} (${country}):`, err.message);
    return [];
  }
};

/**
 * Searches iTunes by mood and optional language / genre.
 */
export const searchItunesTracks = async (mood, language = 'English', genres = [], limit = 12) => {
  const isIndian = /hindi|bollywood|punjabi|tamil|telugu|indian/i.test(language);
  const primaryCountry = isIndian ? 'IN' : 'US';
  const terms = getMoodSearchTerms(mood, language);

  let allResults = [];
  
  // Search with the best terms
  for (const term of terms.slice(0, 2)) {
    const results = await fetchItunesStore(term, primaryCountry, limit);
    allResults = [...allResults, ...results];
    if (allResults.length >= limit) break;
  }

  // Deduplicate by trackId / title
  const seen = new Set();
  const deduped = [];
  for (const song of allResults) {
    const key = `${song.title} - ${song.artist}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      song.mood = mood || 'Neutral';
      deduped.push(song);
    }
    if (deduped.length >= limit) break;
  }

  return deduped;
};

/**
 * Searches iTunes by general text query with intelligent dual-store lookup (IN and US).
 */
export const searchItunesByQuery = async (query, limit = 20) => {
  if (!query || !query.trim()) return [];

  const trimmed = query.trim();
  const isLikelyIndian = /hindi|bollywood|punjabi|arijit|pritam|shreya|badshah|dhillon|armaan|rahman|sonu|singh|kumar|lata|kishore|udit|alka|tum|channa|mereya|dil|tera|tere|pyar|pyaar|ishq|mohabbat|aashiqui|kesariya|kabir|raataan|sidhu|moose|desi/i.test(trimmed);

  // Search IN store first if Indian keywords detected, otherwise search US first
  const countries = isLikelyIndian ? ['IN', 'US'] : ['US', 'IN'];

  try {
    const responses = await Promise.allSettled([
      fetchItunesStore(trimmed, countries[0], limit),
      fetchItunesStore(trimmed, countries[1], Math.floor(limit / 2)),
    ]);

    const resultsPrimary = responses[0].status === 'fulfilled' ? responses[0].value : [];
    const resultsSecondary = responses[1].status === 'fulfilled' ? responses[1].value : [];

    const combined = [...resultsPrimary, ...resultsSecondary];
    const seen = new Set();
    const deduped = [];

    for (const song of combined) {
      const key = `${song.title} - ${song.artist}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(song);
      }
      if (deduped.length >= limit) break;
    }

    return deduped;
  } catch (error) {
    console.error('iTunes Query Search Error:', error.message);
    return [];
  }
};
