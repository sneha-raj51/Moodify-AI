import Song from '../models/Song.js';
import Feedback from '../models/Feedback.js';
import User from '../models/User.js';
import { searchJamendoTracks } from '../services/jamendoService.js';
import { searchItunesTracks } from '../services/itunesService.js';
import { searchAudiusTracks } from '../services/audiusService.js';

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').trim().replace(/\/+$/, '');

/**
 * Normalizes any song (MongoDB, Jamendo, iTunes, Audius) into the documented candidate schema
 */
const normalizeSongCandidate = (song, defaultProvider = 'mongodb') => {
  const songId = song._id ? song._id.toString() : (song.id ? song.id.toString() : '');
  const audioUrl = song.audioUrl || song.audio || song.previewUrl || null;
  const youtubeId = song.youtubeId || null;
  const isPlayable = Boolean(audioUrl || youtubeId || song.isPlayable);
  const provider = song.provider || song.source || defaultProvider;
  const isFull = Boolean(song.isFullAudio || provider === 'audius' || provider === 'jamendo' || (youtubeId && !song.isPreview));

  return {
    id: songId,
    title: song.title || song.name || 'Unknown Title',
    artist: song.artist || song.artist_name || 'Unknown Artist',
    genre: song.genre || null,
    mood: song.mood || (song.moods && song.moods[0]) || null,
    moods: song.moods || (song.mood ? [song.mood] : []),
    language: song.language || null, // Unknown remains null, never guessed
    artwork: song.albumArt || song.cover || song.image || null,
    audio_url: audioUrl,
    youtube_id: youtubeId,
    duration: song.duration || (isFull ? 240 : 30),
    playback_type: isFull ? 'full' : (audioUrl ? 'preview' : 'none'),
    is_playable: isPlayable,
    provider: provider,
    external_id: song.externalId || (song.id && song.id !== songId ? song.id.toString() : null)
  };
};

export const getRecommendations = async (req, res) => {
  try {
    const { 
      mood, 
      desiredMood,
      favoriteGenres = [], 
      favoriteSongIds = [], 
      favoriteArtists = [],
      energyLevel = null,
      recentHistory = [], 
      language = '',
      listeningMode = null,
      feedbackLikes = [],
      feedbackDislikes = []
    } = req.body;
    
    if (!mood) {
      return res.status(400).json({ message: 'Mood is required' });
    }

    // Resolve authenticated user profile preferences if not explicitly overridden
    let userPreferences = {};
    let userFeedbackLikes = (feedbackLikes || []).map(String);
    let userFeedbackDislikes = (feedbackDislikes || []).map(String);

    if (req.user && req.user.id) {
      try {
        const [u, storedFeedbacks] = await Promise.all([
          User.findById(req.user.id).select('preferences').lean(),
          Feedback.find({ userId: req.user.id }).lean()
        ]);
        if (u && u.preferences) {
          userPreferences = u.preferences;
        }
        const dbLikes = storedFeedbacks.filter(f => f.action === 'like').map(f => String(f.songId));
        const dbDislikes = storedFeedbacks.filter(f => f.action === 'dislike').map(f => String(f.songId));
        userFeedbackLikes = [...new Set([...userFeedbackLikes, ...dbLikes])];
        userFeedbackDislikes = [...new Set([...userFeedbackDislikes, ...dbDislikes])];
      } catch (err) {
        console.warn('Could not retrieve user preferences/feedback records:', err.message);
      }
    }

    // Explicit requests in request body take precedence over stored profile preferences
    const effectiveFavoriteGenres = (favoriteGenres && favoriteGenres.length > 0)
      ? favoriteGenres
      : (userPreferences.favoriteGenres || []);

    const effectiveFavoriteArtists = (favoriteArtists && favoriteArtists.length > 0)
      ? favoriteArtists
      : (userPreferences.favoriteArtists || []);

    const effectiveEnergyLevel = energyLevel || userPreferences.energyLevel || null;

    const effectiveLanguage = language || (userPreferences.preferredLanguages && userPreferences.preferredLanguages[0]) || '';

    const effectiveListeningMode = listeningMode || null;

    // 1. Fetch available MongoDB catalog
    const allSongs = await Song.find({});
    if (allSongs.length === 0) {
      return res.status(404).json({ message: 'No songs available in catalog to recommend' });
    }

    // 2. Fetch external tracks from legitimate music APIs (Audius, Jamendo, iTunes)
    let jamendoTracks = [];
    if (process.env.JAMENDO_CLIENT_ID) {
      try {
        jamendoTracks = await searchJamendoTracks(mood, effectiveFavoriteGenres, 5);
      } catch (err) {
        console.warn('Jamendo fetch skipped/failed:', err.message);
      }
    }

    let audiusTracks = [];
    try {
      audiusTracks = await searchAudiusTracks({ mood, genre: effectiveFavoriteGenres?.[0], limit: 6 });
    } catch (err) {
      console.warn('Audius fetch skipped/failed:', err.message);
    }

    let itunesTracks = [];
    try {
      itunesTracks = await searchItunesTracks(mood, effectiveLanguage || 'English', effectiveFavoriteGenres, 12);
    } catch (err) {
      console.warn('iTunes fetch skipped/failed:', err.message);
    }

    // Build unified lookup map
    const catalogMap = new Map();
    const normalizedCatalog = [];

    // Add local MongoDB songs
    for (const s of allSongs) {
      const obj = s.toObject();
      const norm = normalizeSongCandidate(obj, 'mongodb');
      catalogMap.set(norm.id, {
        ...obj,
        id: norm.id,
        _id: norm.id,
        cover: norm.artwork,
        albumArt: norm.artwork,
        audioUrl: obj.audioUrl || obj.previewUrl || null,
        previewUrl: obj.previewUrl || obj.audioUrl || null,
        youtubeId: obj.youtubeId || null,
        duration: obj.duration || norm.duration,
        playbackType: obj.playbackType || (obj.youtubeId ? 'full' : (obj.audioUrl ? 'preview' : 'none')),
        isPlayable: norm.is_playable,
        externalUrl: obj.externalUrl || (obj.youtubeId ? `https://www.youtube.com/watch?v=${obj.youtubeId}` : null)
      });
      normalizedCatalog.push(norm);
    }

    // Add Audius tracks (verified full-length independent music)
    for (const t of audiusTracks) {
      const norm = normalizeSongCandidate(t, 'audius');
      if (!catalogMap.has(norm.id)) {
        catalogMap.set(norm.id, {
          ...t,
          id: norm.id,
          _id: norm.id,
          cover: norm.artwork,
          albumArt: norm.artwork,
          audioUrl: norm.audio_url,
          previewUrl: norm.audio_url,
          isPlayable: norm.is_playable,
          isPreview: false,
          isFullAudio: true,
          previewLabel: 'Full Track',
          sourceLabel: 'Audius',
          duration: t.duration || norm.duration
        });
        normalizedCatalog.push(norm);
      }
    }

    // Add Jamendo tracks (Creative Commons full-length music)
    for (const t of jamendoTracks) {
      const norm = normalizeSongCandidate(t, 'jamendo');
      if (!catalogMap.has(norm.id)) {
        catalogMap.set(norm.id, {
          ...t,
          id: norm.id,
          cover: norm.artwork,
          isPlayable: norm.is_playable,
          isPreview: false,
          isFullAudio: true,
          previewLabel: 'Full Track',
          sourceLabel: 'Jamendo'
        });
        normalizedCatalog.push(norm);
      }
    }

    // Add iTunes tracks (official 30-sec previews)
    for (const t of itunesTracks) {
      const norm = normalizeSongCandidate(t, 'itunes');
      if (!catalogMap.has(norm.id)) {
        catalogMap.set(norm.id, {
          ...t,
          id: norm.id,
          _id: norm.id,
          cover: norm.artwork,
          albumArt: norm.artwork,
          audioUrl: norm.audio_url,
          isPlayable: norm.is_playable,
          isPreview: true,
          isFullAudio: false,
          previewLabel: '30-sec Preview',
          sourceLabel: 'iTunes',
          duration: 30
        });
        normalizedCatalog.push(norm);
      }
    }

    // 3. Request recommendations from Python FastAPI Service
    let recommendations = [];
    let source = 'python-recommender';
    let providerUsed = 'python-ml';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const pyResponse = await fetch(`${ML_SERVICE_URL}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalog: normalizedCatalog,
          preferences: {
            current_mood: mood,
            desired_mood: desiredMood || null,
            preferred_languages: effectiveLanguage ? [effectiveLanguage] : [],
            favorite_genres: effectiveFavoriteGenres,
            favorite_song_ids: favoriteSongIds.map(String),
            favorite_artists: effectiveFavoriteArtists,
            energy_level: effectiveEnergyLevel,
            listening_mode: effectiveListeningMode,
            feedback_likes: userFeedbackLikes,
            feedback_dislikes: userFeedbackDislikes,
            recent_history: recentHistory.map(h => ({
              id: h.id ? String(h.id) : (h.songId ? String(h.songId) : null),
              title: h.title,
              artist: h.artist,
              skipped: Boolean(h.skipped),
              completed: Boolean(h.completed),
              listened_duration: Number(h.listenedDuration || 0)
            }))
          },
          limit: 20
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!pyResponse.ok) {
        throw new Error(`Python service responded with status ${pyResponse.status}: ${pyResponse.statusText}`);
      }

      const mlResults = await pyResponse.json();

      recommendations = mlResults.map(r => {
        const original = catalogMap.get(r.id);
        if (original) {
          return {
            ...original,
            score: r.score,
            explanation: r.explanation,
            reasons: r.reasons || [],
            scoringFactors: r.scoring_factors || {},
            isPlayable: r.is_playable,
            language: r.language
          };
        }
        return null;
      }).filter(Boolean);

    } catch (err) {
      console.warn('Python Recommendation Engine failed, falling back to rule-based ranking:', err.message);
      source = 'rule-based';
      providerUsed = 'fallback';

      // Deterministic fallback: filter by mood, then genre, then language
      let candidates = normalizedCatalog.slice();
      
      const moodMatches = candidates.filter(s => 
        (s.mood && s.mood.toLowerCase() === mood.toLowerCase()) ||
        (s.moods && s.moods.some(m => m.toLowerCase() === mood.toLowerCase()))
      );

      let pool = moodMatches.length > 0 ? moodMatches : candidates;

      // Filter by language if specified
      if (effectiveLanguage) {
        const langMatches = pool.filter(s => s.language && s.language.toLowerCase() === effectiveLanguage.toLowerCase());
        if (langMatches.length > 0) pool = langMatches;
      }

      // Filter out recent skips and disliked tracks
      const skippedIds = new Set(recentHistory.filter(h => h.skipped).map(h => String(h.id || h.songId)));
      const dislikedIds = new Set(userFeedbackDislikes);
      pool = pool.filter(s => !skippedIds.has(s.id) && !dislikedIds.has(s.id));

      if (pool.length === 0) {
        pool = candidates.filter(s => !dislikedIds.has(s.id));
      }

      recommendations = pool.slice(0, 20).map(norm => {
        const original = catalogMap.get(norm.id);
        const scoringFactors = {};
        const reasons = [];

        const isDirectMood = (norm.mood && norm.mood.toLowerCase() === mood.toLowerCase()) ||
                             (norm.moods && norm.moods.some(m => m.toLowerCase() === mood.toLowerCase()));
        if (isDirectMood) {
          scoringFactors.mood_compatibility = 3.0;
          reasons.push(`matches your ${mood} mood`);
        }

        if (norm.genre && effectiveFavoriteGenres.some(g => g.toLowerCase() === norm.genre.toLowerCase())) {
          scoringFactors.genre_preference = 2.0;
          reasons.push(`matches your genre preference (${norm.genre})`);
        }

        if (effectiveFavoriteArtists.length > 0 && norm.artist && effectiveFavoriteArtists.some(a => a.toLowerCase() === norm.artist.toLowerCase())) {
          scoringFactors.artist_preference = 2.0;
          reasons.push(`by one of your favorite artists (${norm.artist})`);
        }

        if (effectiveEnergyLevel) {
          const el = effectiveEnergyLevel.toLowerCase();
          const genre = (norm.genre || '').toLowerCase();
          const songMood = (norm.mood || '').toLowerCase();
          if (el === 'high' || el === 'energetic') {
            if (['rock', 'pop', 'dance', 'electronic', 'hip-hop', 'edm', 'workout'].includes(genre) || ['happy', 'angry', 'surprise'].includes(songMood)) {
              scoringFactors.energy_preference = 1.5;
              reasons.push(`matches your high energy preference`);
            }
          } else if (el === 'low' || el === 'calm') {
            if (['ambient', 'acoustic', 'classical', 'piano', 'lo-fi', 'chill', 'sleep'].includes(genre) || ['calm', 'sad', 'neutral'].includes(songMood)) {
              scoringFactors.energy_preference = 1.5;
              reasons.push(`matches your calm energy preference`);
            }
          } else if (el === 'medium' || el === 'balanced') {
            scoringFactors.energy_preference = 0.5;
            reasons.push(`matches your balanced energy preference`);
          }
        }

        if (effectiveLanguage && norm.language && norm.language.toLowerCase() === effectiveLanguage.toLowerCase()) {
          scoringFactors.language_preference = 2.5;
          reasons.push(`matches preferred language (${norm.language})`);
        }

        if (effectiveListeningMode) {
          scoringFactors.listening_mode = 1.5;
          reasons.push(`curated for ${effectiveListeningMode} mode`);
        }

        let explanation = reasons.length > 0
          ? `Selected because it ${reasons.join(' and ')} (Rule-based fallback).`
          : `Selected for you to discover new music (Rule-based fallback).`;

        return {
          ...original,
          score: Object.values(scoringFactors).reduce((a, b) => a + b, 1.0),
          explanation,
          reasons,
          scoringFactors,
          isPlayable: norm.is_playable,
          language: norm.language
        };
      });

      recommendations.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    return res.status(200).json({
      recommendations,
      count: recommendations.length,
      source,
      provider: providerUsed,
      mood,
      language: language || 'all',
      listeningMode: listeningMode || null
    });

  } catch (error) {
    console.error('Recommendation Controller Error:', error.message);
    res.status(500).json({ message: 'Failed to generate recommendations. Please try again later.' });
  }
};

const JOURNEY_GOALS = {
  'lift-mood': {
    name: 'Lift My Mood',
    description: 'Transition gently from low spirits or fatigue toward uplifted, joyful feelings.',
    defaultStart: 'Sad',
    defaultTarget: 'Happy',
    stages: [
      { name: 'Grounding & Validation', targetMood: 'Sad', listeningMode: 'chill', why: 'Validates where you are without forcing immediate cheerfulness. Empathic music creates emotional safety.' },
      { name: 'Gentle Elevation', targetMood: 'Calm', listeningMode: 'relax', why: 'Introduces soothing acoustic textures and steady melodies to gradually release heavy emotional weight.' },
      { name: 'Joyful Radiance', targetMood: 'Happy', listeningMode: 'chill', why: 'Bright, uplifting rhythms and hopeful progressions to complete your transition into a buoyant state.' }
    ]
  },
  'relax': {
    name: 'Deep Relaxation & Stress Relief',
    description: 'De-escalate stress, anxiety, or high mental tension into peaceful stillness.',
    defaultStart: 'Angry',
    defaultTarget: 'Calm',
    stages: [
      { name: 'Tension Decompression', targetMood: 'Neutral', listeningMode: 'chill', why: 'Channels active mental energy into rhythmic focus before decelerating.' },
      { name: 'Calming Waters', targetMood: 'Calm', listeningMode: 'relax', why: 'Lowers heart rate and eases muscle tension with soft melodies and organic instrumentation.' },
      { name: 'Tranquil Serenity', targetMood: 'Calm', listeningMode: 'relax', why: 'Deep, steady acoustic warmth that establishes lasting emotional stillness.' }
    ]
  },
  'focus': {
    name: 'Focus & Productivity Flow',
    description: 'Guide restless energy into a locked-in, steady cognitive flow state.',
    defaultStart: 'Neutral',
    defaultTarget: 'Calm',
    stages: [
      { name: 'Centering & Declutter', targetMood: 'Neutral', listeningMode: 'chill', why: 'Gently cuts through ambient distractions and quiets mental chatter.' },
      { name: 'Cognitive Rhythm', targetMood: 'Calm', listeningMode: 'study', why: 'Rhythmic, focus-friendly instrumental grooves designed to synchronize cognitive momentum.' },
      { name: 'Deep Flow State', targetMood: 'Calm', listeningMode: 'study', why: 'Minimalist soundscapes that foster sustained concentration and eliminate cognitive fatigue.' }
    ]
  },
  'sleep': {
    name: 'Wind Down for Sleep',
    description: 'Step down from evening alertness into deep, restorative slumber.',
    defaultStart: 'Calm',
    defaultTarget: 'Calm',
    stages: [
      { name: 'Evening Wind-Down', targetMood: 'Calm', listeningMode: 'relax', why: 'Signals the end of the active day with mellow, familiar tempos.' },
      { name: 'Twilight Drift', targetMood: 'Calm', listeningMode: 'sleep', why: 'Reduces melodic complexity and softens acoustic dynamics to trigger drowsiness.' },
      { name: 'Deep Sleep Soundscape', targetMood: 'Calm', listeningMode: 'sleep', why: 'Tranquil ambient soundscapes that support natural sleep cycles without disruption.' }
    ]
  }
};

export const getMoodTransitionRecommendations = async (req, res) => {
  try {
    const { 
      goal = null,
      startMood: reqStartMood, 
      desiredMood: reqDesiredMood, 
      stepsCount = 3, 
      favoriteGenres = [], 
      language = '', 
      favoriteSongIds = [],
      listeningMode = null,
      recentHistory = []
    } = req.body;

    const goalConfig = goal && JOURNEY_GOALS[goal] ? JOURNEY_GOALS[goal] : null;
    const startMood = reqStartMood || (goalConfig ? goalConfig.defaultStart : 'Sad');
    const desiredMood = reqDesiredMood || (goalConfig ? goalConfig.defaultTarget : 'Happy');

    if (!startMood || !desiredMood) {
      return res.status(400).json({ message: 'startMood and desiredMood are required' });
    }

    // Load user feedback for personalization (Feature 2 integration)
    let feedbackLikes = [];
    let feedbackDislikes = [];
    if (req.user && req.user.id) {
      try {
        const userFeedbacks = await Feedback.find({ userId: req.user.id });
        feedbackLikes = userFeedbacks.filter(f => f.action === 'like').map(f => f.songId);
        feedbackDislikes = userFeedbacks.filter(f => f.action === 'dislike').map(f => f.songId);
      } catch (err) {
        console.warn('Could not load user feedback for transition:', err.message);
      }
    }

    const allSongs = await Song.find({});
    if (allSongs.length === 0) {
      return res.status(404).json({ message: 'No songs available in catalog' });
    }

    const catalogMap = new Map();
    const normalizedCatalog = allSongs.map(s => {
      const obj = s.toObject();
      const norm = normalizeSongCandidate(obj, 'mongodb');
      catalogMap.set(norm.id, {
        ...obj,
        id: norm.id,
        _id: norm.id,
        cover: norm.artwork,
        albumArt: norm.artwork,
        isPlayable: norm.is_playable
      });
      return norm;
    });

    // Fetch real tracks for transition start and desired moods (iTunes previews and Audius full tracks)
    try {
      const [startItunes, desiredItunes, startAudius, desiredAudius] = await Promise.all([
        searchItunesTracks(startMood, language || 'English', favoriteGenres, 6).catch(() => []),
        searchItunesTracks(desiredMood, language || 'English', favoriteGenres, 6).catch(() => []),
        searchAudiusTracks({ mood: startMood, genre: favoriteGenres?.[0], limit: 4 }).catch(() => []),
        searchAudiusTracks({ mood: desiredMood, genre: favoriteGenres?.[0], limit: 4 }).catch(() => [])
      ]);

      for (const t of [...startAudius, ...desiredAudius]) {
        const norm = normalizeSongCandidate(t, 'audius');
        if (!catalogMap.has(norm.id)) {
          catalogMap.set(norm.id, {
            ...t,
            id: norm.id,
            _id: norm.id,
            cover: norm.artwork,
            albumArt: norm.artwork,
            audioUrl: norm.audio_url,
            previewUrl: norm.audio_url,
            isPlayable: norm.is_playable,
            isPreview: false,
            isFullAudio: true,
            previewLabel: 'Full Track',
            sourceLabel: 'Audius',
            duration: t.duration || norm.duration
          });
          normalizedCatalog.push(norm);
        }
      }

      const combinedItunes = [...startItunes, ...desiredItunes];
      for (const t of combinedItunes) {
        const norm = normalizeSongCandidate(t, 'itunes');
        if (!catalogMap.has(norm.id)) {
          catalogMap.set(norm.id, {
            ...t,
            id: norm.id,
            _id: norm.id,
            cover: norm.artwork,
            albumArt: norm.artwork,
            audioUrl: norm.audio_url,
            isPlayable: norm.is_playable,
            isPreview: true,
            isFullAudio: false,
            previewLabel: '30-sec Preview',
            sourceLabel: 'iTunes',
            duration: 30
          });
          normalizedCatalog.push(norm);
        }
      }
    } catch (err) {
      console.warn('External transition tracks fetch skipped:', err.message);
    }

    let stages = [];
    let source = 'python-recommender';
    let providerUsed = 'python-ml';

    const getProgressionAttributes = (stageIndex, totalStages, stageMood, finalMood) => {
      const isFirst = stageIndex === 1;
      const isLast = stageIndex === totalStages;
      let energyLevel = 'Balanced (55%)';
      let tempoBpm = '85–100 BPM';
      let transitionGuidance = 'Harmonic bridging between adjacent emotional cadences.';

      if (isFirst) {
        if (['Sad', 'Calm', 'Fear'].includes(stageMood)) {
          energyLevel = 'Gentle / Low (30%)';
          tempoBpm = '60–75 BPM';
        } else if (['Angry'].includes(stageMood)) {
          energyLevel = 'High Intensity (80%)';
          tempoBpm = '110–130 BPM';
        } else {
          energyLevel = 'Moderate (50%)';
          tempoBpm = '75–90 BPM';
        }
        transitionGuidance = 'Empathic Grounding: validates initial emotional state without abrasive shifts.';
      } else if (isLast) {
        if (['Happy', 'Energetic'].includes(finalMood)) {
          energyLevel = 'High / Vibrant (85%)';
          tempoBpm = '115–130 BPM';
        } else if (['Calm'].includes(finalMood)) {
          energyLevel = 'Restful / Tranquil (25%)';
          tempoBpm = '55–70 BPM';
        } else {
          energyLevel = 'Balanced / Centered (60%)';
          tempoBpm = '85–100 BPM';
        }
        transitionGuidance = 'Destination Arrival: acoustic resonance harmonized to anchor target feelings.';
      } else {
        energyLevel = 'Transitional / Evolving (55%)';
        tempoBpm = '85–105 BPM';
        transitionGuidance = 'Intermediate Harmonic Bridge: eases modulation in dynamics, instrumentation, and tempo.';
      }

      return { energyLevel, tempoBpm, transitionGuidance };
    };

    // Build stage definitions
    let stageTemplates = [];
    if (goalConfig) {
      const totalStages = goalConfig.stages.length;
      stageTemplates = goalConfig.stages.map((st, idx) => {
        const stageTarget = idx === 0 && reqStartMood ? reqStartMood : st.targetMood;
        const attrs = getProgressionAttributes(idx + 1, totalStages, stageTarget, desiredMood);
        return {
          stageIndex: idx + 1,
          stageName: st.name,
          targetMood: stageTarget,
          listeningMode: st.listeningMode || listeningMode,
          whyThisStage: st.why,
          progress: idx / (totalStages - 1 || 1),
          energyLevel: attrs.energyLevel,
          tempoBpm: attrs.tempoBpm,
          transitionGuidance: attrs.transitionGuidance
        };
      });
    } else {
      const totalSteps = Math.max(2, Math.min(5, Number(stepsCount) || 3));
      for (let i = 0; i < totalSteps; i++) {
        const progress = i / (totalSteps - 1);
        const stageTarget = progress < 0.34 ? startMood : progress > 0.67 ? desiredMood : 'Calm';
        const stageName = i === 0 
          ? 'Grounding' 
          : i === totalSteps - 1 
            ? 'Destination State' 
            : `Transition Stage ${i + 1}`;
        const why = i === 0 
          ? `Meets you at your current ${startMood} state with empathetic pacing.` 
          : i === totalSteps - 1 
            ? `Arrives at your target ${desiredMood} state with harmonically aligned music.` 
            : `Gentle intermediate bridge from ${startMood} to ${desiredMood}.`;
        
        const attrs = getProgressionAttributes(i + 1, totalSteps, stageTarget, desiredMood);

        stageTemplates.push({
          stageIndex: i + 1,
          stageName,
          targetMood: stageTarget,
          listeningMode: listeningMode || null,
          whyThisStage: why,
          progress,
          energyLevel: attrs.energyLevel,
          tempoBpm: attrs.tempoBpm,
          transitionGuidance: attrs.transitionGuidance
        });
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const pyResponse = await fetch(`${ML_SERVICE_URL}/recommend/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalog: normalizedCatalog,
          start_mood: startMood,
          desired_mood: desiredMood,
          steps_count: stageTemplates.length,
          preferences: {
            current_mood: startMood,
            desired_mood: desiredMood,
            preferred_languages: language ? [language] : [],
            favorite_genres: favoriteGenres,
            favorite_song_ids: favoriteSongIds.map(String),
            favorite_artists: [],
            feedback_likes: feedbackLikes,
            feedback_dislikes: feedbackDislikes,
            listening_mode: listeningMode || null,
            recent_history: recentHistory
          },
          limit_per_step: 3
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!pyResponse.ok) {
        throw new Error(`Python service responded with ${pyResponse.status}`);
      }

      const pySteps = await pyResponse.json();

      stages = stageTemplates.map((template, idx) => {
        const matchingStep = pySteps[idx] || pySteps[pySteps.length - 1];
        const recSongs = (matchingStep?.recommended_songs || []).map(r => {
          const orig = catalogMap.get(r.id);
          return orig ? { 
            ...orig, 
            explanation: r.explanation, 
            score: r.score,
            reasons: r.reasons || [],
            scoringFactors: r.scoring_factors || {}
          } : null;
        }).filter(Boolean);

        return {
          ...template,
          recommendedSongs: recSongs
        };
      });

    } catch (err) {
      console.warn('Python transition recommender failed, using fallback transition:', err.message);
      source = 'rule-based';
      providerUsed = 'fallback';

      stages = stageTemplates.map((template) => {
        const matches = normalizedCatalog.filter(s => s.mood && s.mood.toLowerCase() === template.targetMood.toLowerCase());
        const selected = matches.length > 0 ? matches.slice(0, 3) : normalizedCatalog.slice(0, 3);
        const mappedSongs = selected.map(s => {
          const orig = catalogMap.get(s.id);
          return orig ? {
            ...orig,
            score: 3.5,
            explanation: `Selected for ${template.stageName} targeting ${template.targetMood} mood (Rule-based fallback).`,
            reasons: [`matches ${template.targetMood} mood for ${template.stageName}`],
            scoringFactors: { mood_compatibility: 3.0, journey_stage: 0.5 }
          } : null;
        }).filter(Boolean);

        return {
          ...template,
          recommendedSongs: mappedSongs
        };
      });
    }

    // Legacy 'steps' format for backward compatibility with existing tests and callers
    const legacySteps = stages.map(st => ({
      stepIndex: st.stageIndex,
      targetMood: st.targetMood,
      progress: st.progress,
      recommendedSongs: st.recommendedSongs
    }));

    return res.status(200).json({
      goal: goal || 'custom',
      goalName: goalConfig ? goalConfig.name : 'Custom Journey',
      goalDescription: goalConfig ? goalConfig.description : `Adaptive transition from ${startMood} to ${desiredMood}`,
      startMood,
      desiredMood,
      stages,
      steps: legacySteps,
      source,
      provider: providerUsed
    });

  } catch (error) {
    console.error('Mood Transition Controller Error:', error.message);
    res.status(500).json({ message: 'Failed to generate mood transition. Please try again later.' });
  }
};
