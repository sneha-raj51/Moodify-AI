import mongoose from 'mongoose';
import Song from '../models/Song.js';
import User from '../models/User.js';
import Feedback from '../models/Feedback.js';
import ChatSession from '../models/ChatSession.js';
import { normalizeTrackKey } from './companionService.js';
import { searchItunesTracks, searchItunesByQuery } from './itunesService.js';
import { searchJamendoTracks } from './jamendoService.js';
import { searchAudiusTracks } from './audiusService.js';

export const ALLOWED_MOODS = [
  'Any', 'Happy', 'Sad', 'Angry', 'Disgust', 'Fear', 'Surprise', 'Neutral', 'Calm', 'Energetic'
];

export const ALLOWED_ENERGIES = ['Any', 'Low', 'Medium', 'High'];
export const ALLOWED_VOCAL_PREFS = ['Any', 'Vocals', 'Instrumental'];

/**
 * Normalizes a candidate song into a unified Smart Playlist track object
 */
export const formatSmartTrack = (song, provider = 'mongodb', reason = '') => {
  const id = String(song._id ? song._id.toString() : (song.id ? song.id.toString() : ''));
  const title = String(song.title || song.name || 'Unknown Title').trim();
  const artist = String(song.artist || song.artist_name || 'Unknown Artist').trim();
  const cover = song.cover || song.albumArt || song.image || null;
  const audioUrl = song.audioUrl || song.audio || song.previewUrl || null;
  const isPlayable = Boolean(audioUrl || song.isPlayable);

  const rawDuration = typeof song.duration === 'number' && song.duration > 0
    ? Math.round(song.duration)
    : 30;

  // Determine true playback type
  const isFull = Boolean(
    song.isFullAudio || 
    song.playbackType === 'full' || 
    provider === 'audius' || 
    provider === 'jamendo' || 
    (rawDuration > 60 && provider !== 'itunes')
  );

  const effectiveDuration = isFull ? rawDuration : (provider === 'itunes' ? 30 : rawDuration);

  return {
    id,
    _id: id,
    title,
    artist,
    album: song.album || 'Single',
    cover,
    albumArt: cover,
    audioUrl,
    previewUrl: audioUrl,
    duration: effectiveDuration,
    playbackType: isFull ? 'full' : 'preview',
    isFullAudio: isFull,
    isPreview: !isFull,
    previewLabel: isFull ? 'Full Track' : '30-sec Preview',
    sourceLabel: provider === 'audius' ? 'Audius' : (provider === 'jamendo' ? 'Jamendo' : (provider === 'itunes' ? 'iTunes' : 'Moodify')),
    isPlayable,
    genre: song.genre || 'Music',
    mood: song.mood || (song.moods && song.moods[0]) || 'Neutral',
    language: song.language || 'English',
    source: provider,
    provider: provider,
    explanation: reason || (isFull ? 'Full-length track matched to playlist criteria' : '30-second preview matched to playlist criteria')
  };
};

/**
 * Checks whether track matches the requested energy level using metadata and transparent fallback
 */
export const evaluateEnergy = (track, targetEnergy) => {
  if (!targetEnergy || targetEnergy === 'Any') {
    return { matches: true, reason: 'Energy preference: Any' };
  }

  const explicitEnergy = String(track.energy || '').toLowerCase();
  const mood = String(track.mood || '').toLowerCase();
  const genre = String(track.genre || '').toLowerCase();

  if (targetEnergy === 'Low') {
    if (explicitEnergy === 'low' || explicitEnergy === 'calm') {
      return { matches: true, reason: 'Explicit track metadata: Low energy' };
    }
    if (['calm', 'sad', 'sleep', 'relax'].includes(mood)) {
      return { matches: true, reason: 'Estimated Low energy based on calm/sad mood heuristic (no measured BPM)' };
    }
    if (/ambient|classical|lo-fi|lofi|acoustic|meditation|sleep/i.test(genre)) {
      return { matches: true, reason: 'Estimated Low energy based on acoustic/ambient genre heuristic' };
    }
    return { matches: false, reason: 'Track energy exceeds Low threshold' };
  }

  if (targetEnergy === 'High') {
    if (explicitEnergy === 'high' || explicitEnergy === 'energetic') {
      return { matches: true, reason: 'Explicit track metadata: High energy' };
    }
    if (['energetic', 'angry', 'party', 'hype', 'workout'].includes(mood)) {
      return { matches: true, reason: 'Estimated High energy based on upbeat/energetic mood heuristic (no measured BPM)' };
    }
    if (/rock|metal|electronic|edm|dance|hip-hop|hip hop|party|workout/i.test(genre)) {
      return { matches: true, reason: 'Estimated High energy based on dance/rock/EDM genre heuristic' };
    }
    return { matches: false, reason: 'Track energy does not meet High energy threshold' };
  }

  if (targetEnergy === 'Medium') {
    if (explicitEnergy === 'medium') {
      return { matches: true, reason: 'Explicit track metadata: Medium energy' };
    }
    if (['happy', 'neutral', 'surprise'].includes(mood)) {
      return { matches: true, reason: 'Estimated Medium energy based on moderate mood heuristic' };
    }
    if (/pop|indie|folk|r&b|soul/i.test(genre)) {
      return { matches: true, reason: 'Estimated Medium energy based on pop/indie genre heuristic' };
    }
    // Moderate fallback
    return { matches: true, reason: 'Estimated Medium energy as moderate tempo fallback' };
  }

  return { matches: true, reason: 'Compatible energy profile' };
};

/**
 * Checks vocal preference with strict verification
 */
export const evaluateVocalPreference = (track, vocalPref) => {
  if (!vocalPref || vocalPref === 'Any') {
    return { matches: true, verified: true, reason: 'Vocal preference: Any' };
  }

  const rawGenre = String(track.genre || '').toLowerCase();
  const rawTitle = String(track.title || '').toLowerCase();
  const tags = Array.isArray(track.tags) ? track.tags.map(t => String(t).toLowerCase()) : [];

  const isExplicitInstrumental = 
    track.vocalInstrumental === 'instrumental' ||
    tags.includes('instrumental') ||
    /\b(instrumental|karaoke|backing\s+track|piano\s+version|orchestral)\b/i.test(rawTitle) ||
    /classical|ambient/i.test(rawGenre);

  if (vocalPref === 'Instrumental') {
    if (isExplicitInstrumental) {
      return { matches: true, verified: true, reason: 'Verified instrumental from track metadata/genre' };
    }
    return { matches: false, verified: false, reason: 'Track could not be verified as instrumental from available metadata' };
  }

  if (vocalPref === 'Vocals') {
    if (track.vocalInstrumental === 'vocal' || tags.includes('vocal') || (!isExplicitInstrumental && track.artist && track.artist !== 'Unknown Artist')) {
      return { matches: true, verified: true, reason: 'Verified vocal track from metadata' };
    }
    return { matches: false, verified: false, reason: 'Track contains no verified vocals' };
  }

  return { matches: true, verified: true, reason: 'Compatible vocal profile' };
};

/**
 * Generates an automated, user-customized Smart Playlist adhering to duration,
 * mood, genre, energy, vocal, language, and personal preference signals.
 */
export const buildSmartPlaylist = async ({
  mood = 'Any',
  genre = 'Any',
  energy = 'Any',
  vocalPreference = 'Any',
  language = 'Any',
  targetDurationMinutes = 30,
  preferences = {},
  excludedTrackIds = [],
  user = null
}) => {
  // 1. Validate inputs
  if (mood && mood !== 'Any' && !ALLOWED_MOODS.includes(mood)) {
    throw new Error(`Invalid mood '${mood}'. Allowed moods: ${ALLOWED_MOODS.join(', ')}`);
  }
  if (energy && energy !== 'Any' && !ALLOWED_ENERGIES.includes(energy)) {
    throw new Error(`Invalid energy '${energy}'. Allowed energy levels: ${ALLOWED_ENERGIES.join(', ')}`);
  }
  if (vocalPreference && vocalPreference !== 'Any' && !ALLOWED_VOCAL_PREFS.includes(vocalPreference)) {
    throw new Error(`Invalid vocal preference '${vocalPreference}'. Allowed: ${ALLOWED_VOCAL_PREFS.join(', ')}`);
  }

  const validDurationMinutes = Math.min(180, Math.max(5, parseInt(targetDurationMinutes, 10) || 30));
  const targetDurationSeconds = validDurationMinutes * 60;

  // 2. Identify disliked tracks to exclude
  const excludedIds = new Set((excludedTrackIds || []).map(String));
  const excludedKeys = new Set();

  if (user && preferences.excludeDisliked !== false) {
    try {
      const dislikes = await Feedback.find({ userId: user.id || user._id, action: 'dislike' }).select('songId');
      dislikes.forEach(d => {
        if (d.songId) excludedIds.add(String(d.songId));
      });
    } catch (fbErr) {
      console.warn('Error fetching user dislikes for smart playlist:', fbErr.message);
    }
  }

  // 3. Exclude recently recommended tracks if commanded
  if (user && preferences.excludeRecentlyRecommended === true) {
    try {
      const recentSessions = await ChatSession.find({ userId: user.id || user._id })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select('context');
      for (const s of recentSessions) {
        if (Array.isArray(s.context?.recommendedTrackIds)) {
          s.context.recommendedTrackIds.forEach(id => excludedIds.add(String(id)));
        }
        if (Array.isArray(s.context?.recommendedTrackKeys)) {
          s.context.recommendedTrackKeys.forEach(k => excludedKeys.add(String(k).toLowerCase()));
        }
      }
    } catch (recErr) {
      console.warn('Error fetching recently recommended tracks:', recErr.message);
    }
  }

  // 4. Taste Profile Preferences
  const userTaste = user?.preferences || {};
  let effectiveGenre = genre;
  if ((!effectiveGenre || effectiveGenre === 'Any') && preferences.preferFavoriteGenres && userTaste.favoriteGenres?.length > 0) {
    effectiveGenre = userTaste.favoriteGenres[0];
  }

  const favoriteArtistsSet = new Set(
    (preferences.preferFavoriteArtists && Array.isArray(userTaste.favoriteArtists))
      ? userTaste.favoriteArtists.map(a => a.toLowerCase().trim())
      : []
  );

  // 5. Gather raw candidate tracks from all available sources
  const candidatePool = [];
  const seenIds = new Set(Array.from(excludedIds));
  const seenKeys = new Set(Array.from(excludedKeys));

  const addCandidate = (song, provider, extraReason = '') => {
    if (!song || !song.isPlayable) return false;
    const id = String(song._id ? song._id.toString() : (song.id ? song.id.toString() : ''));
    const { key } = normalizeTrackKey(song.title, song.artist);
    if (!id && !key) return false;

    if ((id && seenIds.has(id)) || (key && seenKeys.has(key))) {
      return false;
    }

    const formatted = formatSmartTrack(song, provider, extraReason);
    if (id) seenIds.add(id);
    if (key) seenKeys.add(key);
    candidatePool.push(formatted);
    return true;
  };

  // A. Query MongoDB Catalog
  const mongoQuery = { isPlayable: true };
  if (mood && mood !== 'Any') {
    if (['Happy', 'Sad', 'Calm', 'Energetic'].includes(mood)) {
      mongoQuery.$or = [
        { mood: new RegExp(`^${mood}$`, 'i') },
        { moods: new RegExp(mood, 'i') }
      ];
    } else if (mood === 'Angry') {
      mongoQuery.$or = [{ mood: /angry/i }, { genre: /rock|metal/i }, { energy: /high|energetic/i }];
    } else if (mood === 'Fear') {
      mongoQuery.$or = [{ mood: /fear/i }, { genre: /ambient|classical/i }];
    } else if (mood === 'Disgust') {
      mongoQuery.$or = [{ mood: /disgust/i }, { genre: /alternative|grunge/i }];
    } else if (mood === 'Surprise') {
      mongoQuery.$or = [{ mood: /surprise/i }, { genre: /electronic|dance/i }];
    } else if (mood === 'Neutral') {
      mongoQuery.$or = [{ mood: /neutral/i }, { genre: /lo-fi|lofi|indie/i }];
    }
  }

  if (effectiveGenre && effectiveGenre !== 'Any') {
    mongoQuery.genre = new RegExp(effectiveGenre, 'i');
  }

  if (language && language !== 'Any') {
    mongoQuery.language = new RegExp(language, 'i');
  }

  try {
    const mongoSongs = await Song.find(mongoQuery).limit(50);
    mongoSongs.forEach(s => addCandidate(s.toObject(), 'mongodb', 'Selected from verified catalog'));
  } catch (mongoErr) {
    console.warn('Smart playlist MongoDB fetch error:', mongoErr.message);
  }

  // B. Query iTunes Previews
  try {
    const itunesQueryList = [];
    if (effectiveGenre && effectiveGenre !== 'Any') itunesQueryList.push(effectiveGenre);
    if (mood && mood !== 'Any') itunesQueryList.push(mood);
    if (language && language !== 'Any') itunesQueryList.push(language);

    const queryStr = itunesQueryList.join(' ') || 'popular music';
    const itunesPromises = [searchItunesByQuery(queryStr, 25)];
    if (mood && mood !== 'Any') {
      itunesPromises.push(
        searchItunesTracks(
          mood,
          language !== 'Any' ? language : 'English',
          effectiveGenre !== 'Any' ? [effectiveGenre] : [],
          20
        )
      );
    }

    const itunesSettled = await Promise.allSettled(itunesPromises);
    if (itunesSettled[0]?.status === 'fulfilled' && Array.isArray(itunesSettled[0].value)) {
      itunesSettled[0].value.forEach(t => {
        addCandidate(t, 'itunes', 'iTunes 30-sec preview');
      });
    }
    if (itunesSettled[1]?.status === 'fulfilled' && Array.isArray(itunesSettled[1].value)) {
      itunesSettled[1].value.forEach(t => {
        addCandidate(t, 'itunes', `iTunes 30-sec preview (${mood} vibe)`);
      });
    }
  } catch (itunesErr) {
    console.warn('Smart playlist iTunes fetch error:', itunesErr.message);
  }

  // C. Query Jamendo (when configured)
  if (process.env.JAMENDO_CLIENT_ID) {
    try {
      const jamendoResults = await searchJamendoTracks({
        mood: mood !== 'Any' ? mood : null,
        genre: effectiveGenre !== 'Any' ? effectiveGenre : null,
        limit: 20
      });
      (jamendoResults || []).forEach(t => {
        addCandidate(t, 'jamendo', 'Jamendo full-length independent track');
      });
    } catch (jamendoErr) {
      console.warn('Smart playlist Jamendo fetch error:', jamendoErr.message);
    }
  }

  // D. Query Audius (when not in unit tests without mocks)
  if (process.env.NODE_ENV !== 'test') {
    try {
      const audiusResults = await searchAudiusTracks({
        mood: mood !== 'Any' ? mood : null,
        genre: effectiveGenre !== 'Any' ? effectiveGenre : null,
        limit: 15
      });
      (audiusResults || []).forEach(t => {
        addCandidate(t, 'audius', 'Audius full-length streaming track');
      });
    } catch (audiusErr) {
      console.warn('Smart playlist Audius fetch error:', audiusErr.message);
    }
  }

  // 6. Filter by Energy and Vocal Preference
  const filteredCandidates = [];
  for (const track of candidatePool) {
    // Energy check
    const energyEval = evaluateEnergy(track, energy);
    if (!energyEval.matches) continue;

    // Vocal preference check
    const vocalEval = evaluateVocalPreference(track, vocalPreference);
    if (!vocalEval.matches) continue;

    // Language check
    if (language && language !== 'Any') {
      const trackLang = String(track.language || '').toLowerCase();
      const targetLang = language.toLowerCase();
      if (trackLang && !trackLang.includes(targetLang) && targetLang !== 'any') {
        if (targetLang === 'hindi' && !/bollywood|desi|hindi/i.test(track.genre || '')) {
          continue;
        }
      }
    }

    // Attach reasons
    const reasons = [];
    if (mood && mood !== 'Any') reasons.push(`Mood: ${mood}`);
    if (energy && energy !== 'Any') reasons.push(energyEval.reason);
    if (vocalPreference && vocalPreference !== 'Any') reasons.push(vocalEval.reason);
    if (favoriteArtistsSet.has(track.artist.toLowerCase().trim())) reasons.push('Favorite Artist boost');

    filteredCandidates.push({
      ...track,
      explanation: reasons.length > 0 ? reasons.join(' • ') : track.explanation
    });
  }

  // 7. Sort and diversify candidates
  // Favorite artists boosted to front
  filteredCandidates.sort((a, b) => {
    const aFav = favoriteArtistsSet.has(a.artist.toLowerCase().trim()) ? 1 : 0;
    const bFav = favoriteArtistsSet.has(b.artist.toLowerCase().trim()) ? 1 : 0;
    return bFav - aFav;
  });

  // 8. Accumulate tracks towards target duration respecting artist diversity
  const selectedTracks = [];
  let accumulatedSeconds = 0;
  const artistCounts = new Map();
  const maxPerArtist = preferences.artistDiversity === false ? 99 : 1;

  // First pass: respect max tracks per artist
  for (const track of filteredCandidates) {
    if (accumulatedSeconds >= targetDurationSeconds) break;
    const artistKey = track.artist.toLowerCase().trim();
    const count = artistCounts.get(artistKey) || 0;
    if (count >= maxPerArtist) continue;

    selectedTracks.push(track);
    accumulatedSeconds += track.duration;
    artistCounts.set(artistKey, count + 1);
  }

  // Second pass: if target duration is not yet reached, allow second track per artist
  if (accumulatedSeconds < targetDurationSeconds && preferences.artistDiversity !== false) {
    for (const track of filteredCandidates) {
      if (accumulatedSeconds >= targetDurationSeconds) break;
      const alreadySelected = selectedTracks.some(s => s.id === track.id);
      if (alreadySelected) continue;

      const artistKey = track.artist.toLowerCase().trim();
      const count = artistCounts.get(artistKey) || 0;
      if (count >= 2) continue;

      selectedTracks.push(track);
      accumulatedSeconds += track.duration;
      artistCounts.set(artistKey, count + 1);
    }
  }

  // 9. Duration Breakdown and Transparency
  const fullTracks = selectedTracks.filter(t => t.playbackType === 'full');
  const previewTracks = selectedTracks.filter(t => t.playbackType === 'preview');
  const totalFullSeconds = fullTracks.reduce((sum, t) => sum + t.duration, 0);
  const totalPreviewSeconds = previewTracks.reduce((sum, t) => sum + t.duration, 0);

  const totalMin = Math.floor(accumulatedSeconds / 60);
  const totalSec = accumulatedSeconds % 60;
  const formattedDuration = `${totalMin}m ${totalSec}s`;

  let durationNotes = '';
  if (fullTracks.length > 0 && previewTracks.length > 0) {
    durationNotes = `Total listening time: ${formattedDuration} (${fullTracks.length} full tracks: ${Math.round(totalFullSeconds / 60)}m, ${previewTracks.length} 30-sec previews: ${Math.round(totalPreviewSeconds / 60)}m). Previews are timed strictly at 30 seconds.`;
  } else if (previewTracks.length > 0 && fullTracks.length === 0) {
    durationNotes = `Total listening time: ${formattedDuration} composed entirely of ${previewTracks.length} 30-sec audio previews.`;
  } else {
    durationNotes = `Total listening time: ${formattedDuration} across ${fullTracks.length} full-length playable tracks.`;
  }

  // 10. Title and Summary Generation
  const moodLabel = mood && mood !== 'Any' ? mood : '';
  const genreLabel = effectiveGenre && effectiveGenre !== 'Any' ? effectiveGenre : '';
  const energyLabel = energy && energy !== 'Any' ? `${energy}-Energy` : '';
  const titleParts = [energyLabel, moodLabel, genreLabel, 'Smart Mix'].filter(Boolean);
  const playlistTitle = titleParts.join(' ') || 'Smart Playlist';

  const insufficientMatches = accumulatedSeconds < (targetDurationSeconds * 0.6);
  let resultMessage = '';
  if (selectedTracks.length === 0) {
    resultMessage = 'No matching tracks found for your selected filters. Try broadening your mood, energy, or genre selection.';
  } else if (insufficientMatches) {
    resultMessage = `Found ${selectedTracks.length} track(s) totaling ${formattedDuration}. Catalog currently has limited matching tracks for this specific combination to meet the full ${validDurationMinutes}-minute target.`;
  } else {
    resultMessage = `Generated ${selectedTracks.length} tracks totaling ${formattedDuration} matching your preferences.`;
  }

  return {
    title: playlistTitle,
    summary: resultMessage,
    filters: {
      mood,
      genre: effectiveGenre,
      energy,
      vocalPreference,
      language,
      targetDurationMinutes: validDurationMinutes
    },
    targetDurationMinutes: validDurationMinutes,
    totalDurationSeconds: accumulatedSeconds,
    totalDurationFormatted: formattedDuration,
    fullTrackCount: fullTracks.length,
    previewCount: previewTracks.length,
    durationNotes,
    tracks: selectedTracks,
    insufficientMatches,
    message: resultMessage
  };
};
