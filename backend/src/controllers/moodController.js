import MoodHistory from '../models/MoodHistory.js';
import { getMoodJournal } from './historyController.js';

export const getMoods = async (req, res) => {
  try {
    const query = req.user ? { userId: req.user.id } : { userId: { $exists: false } };
    const moods = await MoodHistory.find(query).sort({ createdAt: -1 });
    res.status(200).json(moods);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

export const createMood = async (req, res) => {
  try {
    const { mood, source } = req.body;
    
    if (!mood) {
      return res.status(400).json({ message: 'Mood is required' });
    }
    
    const allowedSources = ['manual', 'face-detected', 'face-confirmed', 'journal-entry', 'voice', 'other'];
    const finalSource = allowedSources.includes(source) ? source : 'manual';

    const payload = { 
      mood, 
      source: finalSource,
      note: typeof req.body.note === 'string' ? req.body.note.trim() : ''
    };
    if (req.user) payload.userId = req.user.id;

    const moodRecord = await MoodHistory.create(payload);
    res.status(201).json(moodRecord);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    res.status(500).json({ message: 'Server Error' });
  }
};

export const deleteMood = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const deleted = await MoodHistory.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ message: 'Mood record not found or access denied' });
    }

    res.status(200).json({ message: 'Mood record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Clear all mood records for the authenticated user (Feature 7: Privacy Controls)
 */
export const clearAllMoods = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const result = await MoodHistory.deleteMany({ userId: req.user.id });
    res.status(200).json({ 
      message: 'All mood entries cleared successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Get aggregated mood analytics and journal insights (Feature 5: Mood Journal)
 */
export const getMoodAnalytics = getMoodJournal;
