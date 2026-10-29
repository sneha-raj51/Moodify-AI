import Feedback from '../models/Feedback.js';

/**
 * Record feedback signal (like, dislike, skip, complete)
 * Idempotent: repeated clicks do not create duplicate records or inflate scores.
 */
export const recordFeedback = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { songId, action, title, artist, genre, mood, source, externalId } = req.body;

    if (!songId || !action) {
      return res.status(400).json({ message: 'songId and action are required' });
    }

    const validActions = ['like', 'dislike', 'skip', 'complete'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ 
        message: `Invalid action. Must be one of: ${validActions.join(', ')}` 
      });
    }

    const stringSongId = String(songId).trim();

    // Mutual exclusivity for opposing sentiment:
    // If user likes, remove any prior dislike for this song
    if (action === 'like') {
      await Feedback.deleteMany({ userId: req.user.id, songId: stringSongId, action: 'dislike' });
    } else if (action === 'dislike') {
      await Feedback.deleteMany({ userId: req.user.id, songId: stringSongId, action: 'like' });
    }

    // Upsert record to ensure idempotency and prevent duplicate counting
    const feedback = await Feedback.findOneAndUpdate(
      { userId: req.user.id, songId: stringSongId, action },
      {
        $set: {
          title: title || 'Unknown Title',
          artist: artist || 'Unknown Artist',
          genre: genre || null,
          mood: mood || null,
          source: source || 'mongodb',
          externalId: externalId ? String(externalId) : null,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: 'Feedback recorded successfully',
      feedback
    });
  } catch (error) {
    console.error('recordFeedback error:', error.message);
    return res.status(500).json({ message: 'Failed to record feedback' });
  }
};

/**
 * Get all feedback records for the authenticated user
 */
export const getFeedback = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { action } = req.query;
    const query = { userId: req.user.id };
    if (action) {
      query.action = action;
    }

    const list = await Feedback.find(query).sort({ updatedAt: -1 }).limit(200);
    return res.status(200).json(list);
  } catch (error) {
    console.error('getFeedback error:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve feedback' });
  }
};

/**
 * Delete feedback for a song
 */
export const deleteFeedback = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { songId } = req.params;
    const { action } = req.query;

    const query = { userId: req.user.id, songId: String(songId) };
    if (action) {
      query.action = action;
    }

    const result = await Feedback.deleteMany(query);
    return res.status(200).json({ 
      message: 'Feedback deleted successfully',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('deleteFeedback error:', error.message);
    return res.status(500).json({ message: 'Failed to delete feedback' });
  }
};

/**
 * Get feedback summary metrics
 */
export const getFeedbackSummary = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const feedbacks = await Feedback.find({ userId: req.user.id });
    const summary = {
      likes: feedbacks.filter(f => f.action === 'like').length,
      dislikes: feedbacks.filter(f => f.action === 'dislike').length,
      skips: feedbacks.filter(f => f.action === 'skip').length,
      completes: feedbacks.filter(f => f.action === 'complete').length,
      total: feedbacks.length
    };

    return res.status(200).json(summary);
  } catch (error) {
    console.error('getFeedbackSummary error:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve feedback summary' });
  }
};
