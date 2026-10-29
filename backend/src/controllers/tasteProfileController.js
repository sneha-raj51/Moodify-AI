import mongoose from 'mongoose';
import User from '../models/User.js';
import Feedback from '../models/Feedback.js';
import Favorite from '../models/Favorite.js';
import History from '../models/History.js';
import Song from '../models/Song.js';

const VALID_ENERGY_LEVELS = ['calm', 'balanced', 'energetic', 'low', 'medium', 'high'];
const VALID_MOODS = ['Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise', 'Neutral', 'Calm', 'Energetic'];
const VALID_LISTENING_MODES = ['study', 'relax', 'sleep', 'workout', 'travel', 'chill'];

/**
 * Normalizes string for deduplication comparison
 */
const normalizeStr = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase();
};

/**
 * GET /api/profile/taste
 * Retrieves the comprehensive personal music taste profile for the authenticated user,
 * cleanly separating explicit preferences from legitimate inferred signals.
 */
export const getTasteProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await User.findById(req.user.id).select('name email preferences createdAt updatedAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userId = req.user.id;

    // Concurrently fetch legitimate user activity records
    const [favorites, feedbackList, historyList] = await Promise.all([
      Favorite.find({ userId }).lean(),
      Feedback.find({ userId }).lean(),
      History.find({ userId }).sort({ createdAt: -1 }).limit(100).lean()
    ]);

    // Populate local songs for favorites that do not have externalData
    const mongoIds = favorites.filter(f => !f.externalData && mongoose.Types.ObjectId.isValid(f.songId)).map(f => f.songId);
    let mongoSongMap = new Map();
    if (mongoIds.length > 0) {
      const mongoSongs = await Song.find({ _id: { $in: mongoIds } }).lean();
      mongoSongMap = new Map(mongoSongs.map(s => [s._id.toString(), s]));
    }

    // 1. Explicit Preferences
    const explicit = {
      favoriteGenres: user.preferences?.favoriteGenres || [],
      favoriteArtists: user.preferences?.favoriteArtists || [],
      preferredLanguages: user.preferences?.preferredLanguages || [],
      energyLevel: user.preferences?.energyLevel || 'balanced',
      defaultMood: user.preferences?.defaultMood || 'Happy',
      preferredMoods: user.preferences?.preferredMoods || [],
      favoriteListeningModes: user.preferences?.favoriteListeningModes || [],
      updatedAt: user.preferences?.updatedAt || user.updatedAt
    };

    // 2. Aggregate Inferred Signals from Real Activity
    const likes = feedbackList.filter(f => f.action === 'like');
    const dislikes = feedbackList.filter(f => f.action === 'dislike');
    const skips = feedbackList.filter(f => f.action === 'skip');

    // Genre frequency counts
    const genreCounts = {};
    const countGenre = (genre) => {
      if (!genre || typeof genre !== 'string') return;
      const clean = genre.trim();
      if (!clean) return;
      genreCounts[clean] = (genreCounts[clean] || 0) + 1;
    };

    // Artist frequency counts
    const artistCounts = {};
    const countArtist = (artist) => {
      if (!artist || typeof artist !== 'string') return;
      const clean = artist.trim();
      if (!clean || clean.toLowerCase() === 'unknown artist') return;
      artistCounts[clean] = (artistCounts[clean] || 0) + 1;
    };

    // Mood frequency counts
    const moodCounts = {};
    const countMood = (mood) => {
      if (!mood || typeof mood !== 'string') return;
      const clean = mood.trim();
      if (!clean) return;
      moodCounts[clean] = (moodCounts[clean] || 0) + 1;
    };

    // Process Favorites
    favorites.forEach(f => {
      let songData = f.externalData;
      if (!songData && mongoSongMap.has(f.songId)) {
        songData = mongoSongMap.get(f.songId);
      }
      if (songData) {
        countGenre(songData.genre);
        countArtist(songData.artist);
        countMood(songData.mood);
      }
    });

    // Process Likes (Positive Feedback)
    likes.forEach(l => {
      countGenre(l.genre);
      countArtist(l.artist);
      countMood(l.mood);
    });

    // Process Completed History Listens (meaningful engagement)
    historyList.forEach(h => {
      if (h.completed || h.isMeaningful) {
        countGenre(h.genre);
        countArtist(h.artist);
        countMood(h.mood);
      }
    });

    // Sort inferred rankings by actual frequency
    const inferredTopGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre, count]) => ({ genre, count }));

    const inferredTopArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([artist, count]) => ({ artist, count }));

    const inferredTopMoods = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([mood, count]) => ({ mood, count }));

    // Frequently liked tracks (deduplicated)
    const likedTracksMap = new Map();
    likes.forEach(l => {
      const id = String(l.songId);
      if (!likedTracksMap.has(id)) {
        likedTracksMap.set(id, {
          songId: id,
          title: l.title || 'Unknown Title',
          artist: l.artist || 'Unknown Artist',
          genre: l.genre || null,
          mood: l.mood || null,
          source: l.source || 'mongodb',
          action: 'liked'
        });
      }
    });

    favorites.forEach(f => {
      const id = String(f.songId);
      if (!likedTracksMap.has(id)) {
        let title = 'Favorited Track';
        let artist = 'Artist';
        let genre = null;
        let cover = null;
        if (f.externalData) {
          title = f.externalData.title || title;
          artist = f.externalData.artist || artist;
          genre = f.externalData.genre || genre;
          cover = f.externalData.cover || f.externalData.artwork || null;
        } else if (mongoSongMap.has(id)) {
          const s = mongoSongMap.get(id);
          title = s.title || title;
          artist = s.artist || artist;
          genre = s.genre || genre;
          cover = s.albumArt || s.cover || null;
        }
        likedTracksMap.set(id, {
          songId: id,
          title,
          artist,
          genre,
          cover,
          action: 'favorite'
        });
      }
    });

    const frequentlyLikedTracks = Array.from(likedTracksMap.values()).slice(0, 20);

    // Frequently skipped tracks (deduplicated)
    const skippedTracksMap = new Map();
    skips.forEach(s => {
      const id = String(s.songId);
      if (!skippedTracksMap.has(id)) {
        skippedTracksMap.set(id, {
          songId: id,
          title: s.title || 'Unknown Title',
          artist: s.artist || 'Unknown Artist',
          genre: s.genre || null,
          source: s.source || 'mongodb'
        });
      }
    });

    historyList.forEach(h => {
      if (h.skipped && h.songId) {
        const id = String(h.songId);
        if (!skippedTracksMap.has(id)) {
          skippedTracksMap.set(id, {
            songId: id,
            title: h.title || 'Unknown Title',
            artist: h.artist || 'Unknown Artist',
            genre: h.genre || null,
            source: h.source || 'mongodb'
          });
        }
      }
    });

    const frequentlySkippedTracks = Array.from(skippedTracksMap.values()).slice(0, 20);

    // New user determination: no explicit preferences configured and no activity records
    const hasExplicitPreferences = (
      (user.preferences?.favoriteGenres && user.preferences.favoriteGenres.length > 0) ||
      (user.preferences?.favoriteArtists && user.preferences.favoriteArtists.length > 0) ||
      (user.preferences?.preferredMoods && user.preferences.preferredMoods.length > 0)
    );
    const hasActivity = favorites.length > 0 || feedbackList.length > 0 || historyList.length > 0;
    const isNewUser = !hasExplicitPreferences && !hasActivity;

    return res.status(200).json({
      userName: user.name,
      userEmail: user.email,
      explicit,
      inferred: {
        topGenres: inferredTopGenres,
        topArtists: inferredTopArtists,
        topMoods: inferredTopMoods,
        frequentlyLikedTracks,
        frequentlySkippedTracks,
        activityCounts: {
          likesCount: likes.length,
          dislikesCount: dislikes.length,
          skipsCount: frequentlySkippedTracks.length,
          favoritesCount: favorites.length,
          historyCount: historyList.length
        },
        stats: {
          totalFavorites: favorites.length,
          totalLikes: likes.length,
          totalDislikes: dislikes.length,
          totalSkips: frequentlySkippedTracks.length,
          totalHistoryListened: historyList.length
        }
      },
      isNewUser
    });

  } catch (error) {
    console.error('getTasteProfile error:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve music taste profile' });
  }
};

/**
 * PUT /api/profile/taste
 * Updates the user's explicit music taste preferences with validation and sanitization.
 */
export const updateTasteProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      favoriteGenres,
      favoriteArtists,
      preferredLanguages,
      energyLevel,
      defaultMood,
      preferredMoods,
      favoriteListeningModes
    } = req.body;

    if (!user.preferences) {
      user.preferences = {};
    }

    // Sanitize and validate genres (array of non-empty strings, capped at 25)
    if (favoriteGenres !== undefined) {
      if (!Array.isArray(favoriteGenres)) {
        return res.status(400).json({ message: 'favoriteGenres must be an array of strings' });
      }
      user.preferences.favoriteGenres = [...new Set(
        favoriteGenres
          .filter(g => typeof g === 'string' && g.trim())
          .map(g => g.trim())
      )].slice(0, 25);
    }

    // Sanitize and validate artists (array of non-empty strings, capped at 25)
    if (favoriteArtists !== undefined) {
      if (!Array.isArray(favoriteArtists)) {
        return res.status(400).json({ message: 'favoriteArtists must be an array of strings' });
      }
      user.preferences.favoriteArtists = [...new Set(
        favoriteArtists
          .filter(a => typeof a === 'string' && a.trim())
          .map(a => a.trim())
      )].slice(0, 25);
    }

    // Sanitize and validate languages
    if (preferredLanguages !== undefined) {
      if (!Array.isArray(preferredLanguages)) {
        return res.status(400).json({ message: 'preferredLanguages must be an array of strings' });
      }
      user.preferences.preferredLanguages = [...new Set(
        preferredLanguages
          .filter(l => typeof l === 'string' && l.trim())
          .map(l => l.trim())
      )].slice(0, 10);
    }

    // Energy level validation
    if (energyLevel !== undefined) {
      const cleanEnergy = String(energyLevel).trim().toLowerCase();
      if (!VALID_ENERGY_LEVELS.includes(cleanEnergy)) {
        return res.status(400).json({ 
          message: `Invalid energyLevel. Must be one of: ${VALID_ENERGY_LEVELS.join(', ')}` 
        });
      }
      user.preferences.energyLevel = cleanEnergy;
    }

    // Default mood validation
    if (defaultMood !== undefined) {
      user.preferences.defaultMood = String(defaultMood).trim();
    }

    // Preferred moods validation
    if (preferredMoods !== undefined) {
      if (!Array.isArray(preferredMoods)) {
        return res.status(400).json({ message: 'preferredMoods must be an array of strings' });
      }
      user.preferences.preferredMoods = [...new Set(
        preferredMoods
          .filter(m => typeof m === 'string' && m.trim())
          .map(m => m.trim())
      )].slice(0, 10);
    }

    // Favorite listening modes validation
    if (favoriteListeningModes !== undefined) {
      if (!Array.isArray(favoriteListeningModes)) {
        return res.status(400).json({ message: 'favoriteListeningModes must be an array of strings' });
      }
      user.preferences.favoriteListeningModes = [...new Set(
        favoriteListeningModes
          .filter(m => typeof m === 'string' && m.trim())
          .map(m => m.trim().toLowerCase())
      )].slice(0, 10);
    }

    user.preferences.updatedAt = new Date();
    await user.save();

    return res.status(200).json({
      message: 'Music taste profile updated successfully',
      preferences: user.preferences,
      explicit: {
        favoriteGenres: user.preferences.favoriteGenres,
        favoriteArtists: user.preferences.favoriteArtists,
        preferredLanguages: user.preferences.preferredLanguages,
        energyLevel: user.preferences.energyLevel,
        defaultMood: user.preferences.defaultMood,
        preferredMoods: user.preferences.preferredMoods,
        favoriteListeningModes: user.preferences.favoriteListeningModes,
        updatedAt: user.preferences.updatedAt
      }
    });

  } catch (error) {
    console.error('updateTasteProfile error:', error.message);
    return res.status(500).json({ message: 'Failed to update music taste profile' });
  }
};

/**
 * POST /api/profile/taste/reset-inferred
 * Allows users to reset inferred preference signals (clearing negative/skip records)
 * without deleting their explicit preferences, account, or saved playlists.
 */
export const resetInferredTaste = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user.id;

    // Remove inferred negative signals (skips and dislikes)
    const [deletedSkips, updatedHistory] = await Promise.all([
      Feedback.deleteMany({ userId, action: { $in: ['skip', 'dislike'] } }),
      History.updateMany({ userId, skipped: true }, { $set: { skipped: false } })
    ]);

    return res.status(200).json({
      message: 'Inferred taste preferences and skip penalties have been reset.',
      resetCount: deletedSkips.deletedCount || 0
    });

  } catch (error) {
    console.error('resetInferredTaste error:', error.message);
    return res.status(500).json({ message: 'Failed to reset inferred taste signals' });
  }
};
