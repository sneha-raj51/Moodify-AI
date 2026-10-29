import mongoose from 'mongoose';
import History from '../models/History.js';
import Favorite from '../models/Favorite.js';
import Song from '../models/Song.js';
import MoodHistory from '../models/MoodHistory.js';
import Feedback from '../models/Feedback.js';
import ChatSession from '../models/ChatSession.js';
import { searchItunesTracks } from '../services/itunesService.js';

export const logListen = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { songId, title, artist, cover, genre, mood, source, audioUrl, isPlayable } = req.body;
    if (!songId || !title || !artist) {
      return res.status(400).json({ message: 'Missing required song metadata' });
    }

    const payload = { 
      userId: req.user.id,
      songId: String(songId), 
      title: String(title).trim(), 
      artist: String(artist).trim(), 
      cover: cover || null, 
      genre: genre || null, 
      mood: mood || null, 
      source: source || 'mongodb',
      audioUrl: audioUrl || null,
      isPlayable: Boolean(audioUrl || isPlayable)
    };

    const record = await History.create(payload);
    res.status(201).json(record);
  } catch (error) {
    console.error('logListen error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const updateListen = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid history ID' });
    }

    const { listenedDuration, isMeaningful, completed, skipped } = req.body;
    
    // Strict ownership verification: only update records owned by the current user
    const record = await History.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { 
        $set: { 
          ...(listenedDuration !== undefined && { listenedDuration: Number(listenedDuration) }),
          ...(isMeaningful !== undefined && { isMeaningful: Boolean(isMeaningful) }),
          ...(completed !== undefined && { completed: Boolean(completed) }),
          ...(skipped !== undefined && { skipped: Boolean(skipped) })
        } 
      },
      { new: true }
    );
    
    if (!record) {
      return res.status(404).json({ message: 'History record not found or access denied' });
    }

    res.status(200).json(record);
  } catch (error) {
    console.error('updateListen error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const getHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const history = await History.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json(history);
  } catch (error) {
    console.error('getHistory error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const clearHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Only delete records belonging to this user
    await History.deleteMany({ userId: req.user.id });
    res.status(200).json({ message: 'History cleared successfully' });
  } catch (error) {
    console.error('clearHistory error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Listening Mix / Listening Recap Generator
 * Scoped exclusively to the authenticated user's records.
 */
export const getListeningRecap = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { range = '7d', from, to, mode = 'from-listening' } = req.query;

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (range) {
      case '1d':
        startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '2d':
        startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '8d':
        startDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case 'custom':
        if (!from || !to) {
          return res.status(400).json({ message: 'Both "from" and "to" date parameters are required for custom range' });
        }
        
        const fromTimestamp = Date.parse(from);
        const toTimestamp = Date.parse(to);
        if (isNaN(fromTimestamp) || isNaN(toTimestamp)) {
          return res.status(400).json({ message: 'Invalid date format for custom range. Expected YYYY-MM-DD or ISO 8601' });
        }

        if (typeof from === 'string' && from.length === 10) {
          startDate = new Date(`${from}T00:00:00.000Z`);
        } else {
          startDate = new Date(from);
        }

        if (typeof to === 'string' && to.length === 10) {
          endDate = new Date(`${to}T23:59:59.999Z`);
        } else {
          endDate = new Date(to);
        }

        if (startDate > endDate) {
          return res.status(400).json({ message: '"from" date must be before or equal to "to" date' });
        }
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
    }

    const records = await History.find({
      userId: req.user.id,
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: -1 });

    // Aggregate statistics
    let totalDurationSeconds = 0;
    let completedCount = 0;
    let meaningfulCount = 0;
    const songMap = new Map();
    const artistMap = new Map();
    const genreMap = new Map();

    for (const r of records) {
      totalDurationSeconds += (r.listenedDuration || 0);
      if (r.completed) completedCount++;
      if (r.isMeaningful) meaningfulCount++;

      const sKey = r.songId;
      if (!songMap.has(sKey)) {
        songMap.set(sKey, {
          id: r.songId,
          _id: r.songId,
          songId: r.songId,
          title: r.title,
          artist: r.artist,
          cover: r.cover,
          albumArt: r.cover,
          genre: r.genre,
          mood: r.mood,
          source: r.source,
          audioUrl: r.audioUrl,
          isPlayable: Boolean(r.audioUrl || r.isPlayable),
          count: 0,
          totalDuration: 0,
          lastPlayed: r.createdAt
        });
      }
      const sEntry = songMap.get(sKey);
      sEntry.count++;
      sEntry.totalDuration += (r.listenedDuration || 0);

      if (r.artist) {
        artistMap.set(r.artist, (artistMap.get(r.artist) || 0) + 1);
      }
      if (r.genre) {
        genreMap.set(r.genre, (genreMap.get(r.genre) || 0) + 1);
      }
    }

    const mostPlayedTracks = Array.from(songMap.values())
      .sort((a, b) => b.count - a.count || b.totalDuration - a.totalDuration);

    const repeatedListens = mostPlayedTracks.filter(t => t.count > 1);

    const topArtists = Array.from(artistMap.entries())
      .map(([name, count]) => ({ name, artist: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topGenres = Array.from(genreMap.entries())
      .map(([name, count]) => ({ name, genre: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get liked songs for this user in this period
    const periodFavs = await Favorite.find({
      userId: req.user.id,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const isStrictListeningMode = mode === 'from-listening' || mode === 'listening';
    let generatedPlaylist = [];

    if (isStrictListeningMode) {
      generatedPlaylist = mostPlayedTracks.map(t => ({
        ...t,
        isRecommendation: false,
        recapReason: t.count > 1 ? `Listened ${t.count} times in this period` : 'Played in this period'
      }));
    } else {
      const baseTracks = mostPlayedTracks.map(t => ({
        ...t,
        isRecommendation: false,
        recapReason: t.count > 1 ? `Heavy rotation (${t.count} plays)` : 'Your listening history'
      }));

      generatedPlaylist = [...baseTracks];

      const primaryMood = records.find(r => r.mood)?.mood || 'Happy';
      const favoriteGenresList = topGenres.map(g => g.name);

      try {
        const freshRecs = await searchItunesTracks(primaryMood, 'English', favoriteGenresList, 6);
        const existingIds = new Set(generatedPlaylist.map(t => t.id));

        for (const rec of freshRecs) {
          if (!existingIds.has(rec.id)) {
            generatedPlaylist.push({
              ...rec,
              isRecommendation: true,
              recapReason: `Recommended addition based on your top genre (${favoriteGenresList[0] || 'Music'})`
            });
            existingIds.add(rec.id);
          }
        }
      } catch (err) {
        console.warn('Smart Mix recommendation enrichment skipped:', err.message);
      }
    }

    const stats = {
      totalListens: records.length,
      totalPlays: records.length,
      totalDurationSeconds,
      totalListenedSeconds: totalDurationSeconds,
      meaningfulListens: meaningfulCount,
      completedTracks: completedCount,
      repeatedListensCount: repeatedListens.length,
      repeatedPlays: repeatedListens.length,
      likedSongsCount: periodFavs.length,
      likedInPeriod: periodFavs.length,
      topArtists,
      topGenres,
      mostPlayedTracks: mostPlayedTracks.slice(0, 5),
      topSongs: mostPlayedTracks.slice(0, 5)
    };

    res.status(200).json({
      range,
      mode: isStrictListeningMode ? 'from-listening' : 'smart-mix',
      startDate,
      endDate,
      stats,
      recap: stats,
      generatedPlaylist,
      playlist: generatedPlaylist
    });
  } catch (error) {
    console.error('getListeningRecap error:', error.message);
    res.status(500).json({ message: 'Server error generating listening recap' });
  }
};

/**
 * Mood Journal and Music Insights
 * Scoped strictly to the authenticated user's records.
 * Supports time filtering: 7d, 30d, all
 */
export const getMoodJournal = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { range = '7d', mood: filterMood, from, to } = req.query;
    const now = new Date();
    let startDate = null;
    let endDate = now;

    if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'custom') {
      if (!from || !to) {
        return res.status(400).json({ message: 'Both "from" and "to" parameters are required for custom range' });
      }
      const fromTs = Date.parse(from);
      const toTs = Date.parse(to);
      if (isNaN(fromTs) || isNaN(toTs)) {
        return res.status(400).json({ message: 'Invalid date format. Expected YYYY-MM-DD or ISO 8601' });
      }
      startDate = new Date(fromTs);
      endDate = new Date(toTs);
      if (startDate > endDate) {
        return res.status(400).json({ message: '"from" date cannot be after "to" date' });
      }
    } // 'all' leaves startDate = null

    const moodQuery = { userId: req.user.id };
    const historyQuery = { userId: req.user.id };
    const feedbackQuery = { userId: req.user.id };
    const favoriteQuery = { userId: req.user.id };
    const chatQuery = { userId: req.user.id };

    if (startDate) {
      moodQuery.createdAt = { $gte: startDate, $lte: endDate };
      historyQuery.createdAt = { $gte: startDate, $lte: endDate };
      feedbackQuery.createdAt = { $gte: startDate, $lte: endDate };
      favoriteQuery.createdAt = { $gte: startDate, $lte: endDate };
      chatQuery.updatedAt = { $gte: startDate, $lte: endDate };
    }

    if (filterMood && filterMood !== 'all' && filterMood !== 'All') {
      moodQuery.mood = new RegExp(`^${filterMood}$`, 'i');
    }

    const [moodRecords, listenRecords, feedbackRecords, favoriteRecords, chatSessions] = await Promise.all([
      MoodHistory.find(moodQuery).sort({ createdAt: -1 }).limit(300),
      History.find(historyQuery).sort({ createdAt: -1 }).limit(600),
      Feedback.find(feedbackQuery).sort({ createdAt: -1 }).limit(600),
      Favorite.find(favoriteQuery).sort({ createdAt: -1 }).limit(300),
      ChatSession.find(chatQuery).sort({ updatedAt: -1 }).limit(100).select('context')
    ]);

    // 1. Mood breakdown
    const moodCounts = {};
    for (const m of moodRecords) {
      const moodName = m.mood ? (m.mood.charAt(0).toUpperCase() + m.mood.slice(1).toLowerCase()) : 'Unknown';
      moodCounts[moodName] = (moodCounts[moodName] || 0) + 1;
    }

    const totalMoodEntries = moodRecords.length;
    const topMoods = Object.entries(moodCounts)
      .map(([mood, count]) => ({
        mood,
        count,
        percentage: totalMoodEntries > 0 ? Math.round((count / totalMoodEntries) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    const mostFrequentMood = topMoods.length > 0 ? topMoods[0].mood : null;

    // 2. Chronological daily mood changes (timeline progression)
    const dayMap = {};
    for (const m of [...moodRecords].reverse()) {
      const dayKey = new Date(m.createdAt).toISOString().slice(0, 10);
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = { date: dayKey, entries: 0, moodCounts: {}, moods: [] };
      }
      dayMap[dayKey].entries++;
      dayMap[dayKey].moods.push(m.mood);
      dayMap[dayKey].moodCounts[m.mood] = (dayMap[dayKey].moodCounts[m.mood] || 0) + 1;
    }

    const moodChangesAcrossPeriod = Object.values(dayMap).map(d => {
      let dominant = 'Neutral';
      let maxC = 0;
      for (const [mName, cnt] of Object.entries(d.moodCounts)) {
        if (cnt > maxC) {
          maxC = cnt;
          dominant = mName;
        }
      }
      return {
        date: d.date,
        entriesCount: d.entries,
        dominantMood: dominant,
        recordedMoods: d.moods
      };
    });

    // 3. Listening Modes aggregation from chat sessions and history context
    const listeningModeCounts = {};
    for (const s of chatSessions) {
      const m = s.context?.listeningMode;
      if (m && typeof m === 'string') {
        const cleanMode = m.toLowerCase();
        listeningModeCounts[cleanMode] = (listeningModeCounts[cleanMode] || 0) + 1;
      }
    }
    const listeningModesUsed = Object.entries(listeningModeCounts)
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Correlate listens with mood entries (tracks listened within 2 hours of mood log)
    const moodInteractionMap = {};
    const journalTimeline = moodRecords.map(m => {
      const mTime = new Date(m.createdAt).getTime();
      const moodKey = m.mood ? (m.mood.charAt(0).toUpperCase() + m.mood.slice(1).toLowerCase()) : 'Unknown';
      if (!moodInteractionMap[moodKey]) {
        moodInteractionMap[moodKey] = { mood: moodKey, listens: 0, likes: 0, skips: 0, genres: {} };
      }

      const correlated = listenRecords.filter(h => {
        const hTime = new Date(h.createdAt).getTime();
        return Math.abs(hTime - mTime) <= 2 * 60 * 60 * 1000;
      }).slice(0, 6).map(h => {
        moodInteractionMap[moodKey].listens++;
        if (h.genre) {
          moodInteractionMap[moodKey].genres[h.genre] = (moodInteractionMap[moodKey].genres[h.genre] || 0) + 1;
        }
        return {
          songId: h.songId,
          title: h.title,
          artist: h.artist,
          cover: h.cover,
          genre: h.genre,
          mood: h.mood,
          listenedDuration: h.listenedDuration,
          completed: h.completed,
          createdAt: h.createdAt
        };
      });

      return {
        id: m._id,
        _id: m._id,
        mood: m.mood,
        note: m.note || '',
        source: m.source || 'manual',
        createdAt: m.createdAt,
        correlatedTracks: correlated
      };
    });

    // Match feedback with mood states
    for (const fb of feedbackRecords) {
      if (fb.mood) {
        const mKey = fb.mood.charAt(0).toUpperCase() + fb.mood.slice(1).toLowerCase();
        if (moodInteractionMap[mKey]) {
          if (fb.action === 'like') moodInteractionMap[mKey].likes++;
          if (fb.action === 'skip') moodInteractionMap[mKey].skips++;
        }
      }
    }

    const moodFeedbackAssociations = Object.values(moodInteractionMap).map(item => ({
      mood: item.mood,
      listensCount: item.listens,
      likesCount: item.likes,
      skipsCount: item.skips,
      topGenre: Object.entries(item.genres).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Varied'
    }));

    // 5. Frequently liked genres and artists
    const likedGenreCounts = {};
    const likedArtistCounts = {};
    for (const f of feedbackRecords) {
      if (f.action === 'like') {
        if (f.genre) likedGenreCounts[f.genre] = (likedGenreCounts[f.genre] || 0) + 1;
        if (f.artist && f.artist !== 'Unknown Artist') {
          likedArtistCounts[f.artist] = (likedArtistCounts[f.artist] || 0) + 1;
        }
      }
    }

    const frequentlyLikedGenres = Object.entries(likedGenreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const frequentlyLikedArtists = Object.entries(likedArtistCounts)
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 6. Listening metrics & completion rates
    let totalDurationSeconds = 0;
    let completedCount = 0;
    let skipCount = 0;

    for (const h of listenRecords) {
      totalDurationSeconds += (h.listenedDuration || 0);
      if (h.completed) completedCount++;
      if (h.skipped || (h.listenedDuration > 0 && h.listenedDuration < 15)) {
        skipCount++;
      }
    }

    const totalListens = listenRecords.length;
    const completionRate = totalListens > 0 ? Math.round((completedCount / totalListens) * 100) : 0;
    const skipRate = totalListens > 0 ? Math.round((skipCount / totalListens) * 100) : 0;

    const feedbackSummary = {
      likes: feedbackRecords.filter(f => f.action === 'like').length,
      dislikes: feedbackRecords.filter(f => f.action === 'dislike').length,
      skips: feedbackRecords.filter(f => f.action === 'skip').length,
      completes: feedbackRecords.filter(f => f.action === 'complete').length,
      favorites: favoriteRecords.length
    };

    // Genre-to-mood correlations
    const genreByMoodMap = {};
    const artistByMoodMap = {};
    for (const h of listenRecords) {
      if (h.mood) {
        const moodKey = h.mood.charAt(0).toUpperCase() + h.mood.slice(1).toLowerCase();
        if (h.genre) {
          if (!genreByMoodMap[moodKey]) genreByMoodMap[moodKey] = {};
          genreByMoodMap[moodKey][h.genre] = (genreByMoodMap[moodKey][h.genre] || 0) + 1;
        }
        if (h.artist) {
          if (!artistByMoodMap[moodKey]) artistByMoodMap[moodKey] = {};
          artistByMoodMap[moodKey][h.artist] = (artistByMoodMap[moodKey][h.artist] || 0) + 1;
        }
      }
    }

    const genreMoodCorrelations = {};
    for (const [moodKey, gCounts] of Object.entries(genreByMoodMap)) {
      const totalForMood = Object.values(gCounts).reduce((a, b) => a + b, 0);
      genreMoodCorrelations[moodKey] = Object.entries(gCounts)
        .map(([genre, count]) => ({
          genre,
          count,
          percentage: totalForMood > 0 ? Math.round((count / totalForMood) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    const topArtistsByMood = {};
    for (const [moodKey, aCounts] of Object.entries(artistByMoodMap)) {
      topArtistsByMood[moodKey] = Object.entries(aCounts)
        .map(([artist, count]) => ({ artist, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    // Explicit Weekly Summary
    const weeklySummary = {
      periodLabel: 'Last 7 Days',
      entriesCount: moodRecords.filter(m => new Date(m.createdAt) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).length,
      mostFrequentMood,
      moodDistribution: topMoods,
      moodChangesAcrossWeek: moodChangesAcrossPeriod.slice(-7),
      tracksLiked: feedbackSummary.likes,
      tracksSkipped: feedbackSummary.skips,
      tracksFavorited: feedbackSummary.favorites,
      listeningModesUsed
    };

    // Explicit Monthly Summary
    const monthlySummary = {
      periodLabel: 'Last 30 Days',
      totalEntries: totalMoodEntries,
      mostFrequentMood,
      moodDistribution: topMoods,
      moodChangesAcrossMonth: moodChangesAcrossPeriod,
      feedbackTrends: feedbackSummary,
      frequentlyLikedGenres,
      frequentlyLikedArtists
    };

    // Explicit Mood and Music Relationships
    const moodAndMusicRelationships = {
      moodFeedbackAssociations,
      topListeningModes: listeningModesUsed,
      positiveFeedbackGenres: frequentlyLikedGenres,
      positiveFeedbackArtists: frequentlyLikedArtists,
      recommendationAcceptanceRate: totalListens > 0 ? Math.round(((feedbackSummary.likes + completedCount) / totalListens) * 100) : 0
    };

    const hasData = totalMoodEntries > 0 || totalListens > 0;

    return res.status(200).json({
      range,
      startDate: startDate || new Date(0),
      endDate,
      hasData,
      totalMoodEntries,
      mostFrequentMood,
      topMoods,
      genreMoodCorrelations,
      topArtistsByMood,
      weeklySummary,
      monthlySummary,
      moodAndMusicRelationships,
      listeningMetrics: {
        totalListens,
        totalDurationSeconds,
        completedCount,
        completionRate,
        skipCount,
        skipRate,
        feedback: feedbackSummary
      },
      journalTimeline,
      disclaimer: 'Mood insights describe observed patterns between self-reported reflections and playback logs. They do not infer psychological diagnoses, medical conditions, or definitive emotional states.'
    });
  } catch (error) {
    console.error('getMoodJournal error:', error.message);
    res.status(500).json({ message: 'Server error generating mood journal' });
  }
};

