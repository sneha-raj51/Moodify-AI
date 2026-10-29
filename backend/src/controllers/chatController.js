import mongoose from 'mongoose';
import ChatSession from '../models/ChatSession.js';
import User from '../models/User.js';
import Favorite from '../models/Favorite.js';
import { processCompanionMessage, normalizeTrackKey, isNeverRecommendedBefore } from '../services/companionService.js';

/**
 * Get all chat sessions for the authenticated user
 */
export const getChatSessions = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const sessions = await ChatSession.find({ userId: req.user.id })
      .select('title messages updatedAt createdAt')
      .sort({ updatedAt: -1 });

    const formatted = sessions.map(s => ({
      _id: s._id,
      id: s._id,
      title: s.title,
      messageCount: s.messages ? s.messages.length : 0,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('getChatSessions error:', error.message);
    res.status(500).json({ message: 'Server error retrieving chat sessions' });
  }
};

/**
 * Create a new chat session for authenticated user
 */
export const createChatSession = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const title = (req.body.title || 'New Music Chat').trim();

    const welcomeMessage = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'assistant',
      text: "Hi! I'm Moodify AI, your music companion. Tell me how you're feeling, or choose a vibe below to get started.",
      quickReplies: [
        'Calm and relaxing',
        'Emotional Bollywood',
        'Uplifting music',
        'Energetic songs',
        'Let me explain my mood'
      ],
      recommendations: [],
      timestamp: new Date()
    };

    const session = await ChatSession.create({
      userId: req.user.id,
      title,
      messages: [welcomeMessage],
      context: {}
    });

    res.status(201).json(session);
  } catch (error) {
    console.error('createChatSession error:', error.message);
    res.status(500).json({ message: 'Server error creating chat session' });
  }
};

/**
 * Get single session by ID (with ownership check)
 */
export const getChatSessionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID format' });
    }

    const session = await ChatSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    if (!req.user || session.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this chat session' });
    }

    res.status(200).json(session);
  } catch (error) {
    console.error('getChatSessionById error:', error.message);
    res.status(500).json({ message: 'Server error retrieving chat session' });
  }
};

/**
 * Send message in chat session and receive companion response
 */
export const sendChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, context: clientContext } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID format' });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const session = await ChatSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    if (!req.user || session.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this chat session' });
    }

    // Load user preferences for personalized recommendations
    const user = await User.findById(req.user.id);
    const preferences = user ? (user.preferences || {}) : {};

    // Record user message
    const userMsgObj = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'user',
      text: message.trim(),
      quickReplies: [],
      recommendations: [],
      timestamp: new Date()
    };
    session.messages.push(userMsgObj);

    // Update session title if this is the first user query
    const userMessageCount = session.messages.filter(m => m.role === 'user').length;
    if (userMessageCount === 1) {
      const summary = message.trim().slice(0, 32);
      session.title = summary.length > 30 ? `${summary.slice(0, 30)}...` : summary;
    }

    // Gather recommendation history from current session messages and context
    const sessionTrackIds = new Set();
    const sessionTrackKeys = new Set();

    if (Array.isArray(session.messages)) {
      for (const m of session.messages) {
        if (m.role === 'assistant' && Array.isArray(m.recommendations)) {
          for (const t of m.recommendations) {
            const id = String(t.id || t._id || t.songId || '');
            if (id) sessionTrackIds.add(id);
            const { key } = normalizeTrackKey(t.title, t.artist);
            if (key) sessionTrackKeys.add(key);
          }
        }
      }
    }

    if (Array.isArray(session.context?.recommendedTrackIds)) {
      session.context.recommendedTrackIds.forEach(id => sessionTrackIds.add(String(id)));
    }
    if (Array.isArray(session.context?.recommendedTrackKeys)) {
      session.context.recommendedTrackKeys.forEach(k => sessionTrackKeys.add(String(k)));
    }

    // If user explicitly asks for songs never recommended before, also aggregate across user's other sessions
    let userHistoricalIds = new Set();
    let userHistoricalKeys = new Set();
    if (isNeverRecommendedBefore(message)) {
      try {
        const userSessions = await ChatSession.find({ userId: req.user.id }).select('messages context');
        for (const us of userSessions) {
          if (Array.isArray(us.messages)) {
            for (const m of us.messages) {
              if (m.role === 'assistant' && Array.isArray(m.recommendations)) {
                for (const t of m.recommendations) {
                  const id = String(t.id || t._id || t.songId || '');
                  if (id) userHistoricalIds.add(id);
                  const { key } = normalizeTrackKey(t.title, t.artist);
                  if (key) userHistoricalKeys.add(key);
                }
              }
            }
          }
        }
      } catch (histErr) {
        console.warn('Error fetching user historical sessions for exclusion:', histErr.message);
      }
    }

    // Merge persistent session context with current runtime client context
    const runtimeContext = {
      ...(session.context || {}),
      ...(clientContext || {}),
      userId: req.user.id,
      sessionTrackIds: Array.from(sessionTrackIds),
      sessionTrackKeys: Array.from(sessionTrackKeys),
      userHistoricalIds: Array.from(userHistoricalIds),
      userHistoricalKeys: Array.from(userHistoricalKeys)
    };

    // Process companion response
    const companionResult = await processCompanionMessage({
      message: message.trim(),
      context: runtimeContext,
      preferences,
      user
    });

    // Record assistant message
    const assistantMsgObj = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'assistant',
      text: companionResult.text,
      quickReplies: companionResult.quickReplies || [],
      recommendations: companionResult.recommendations || [],
      timestamp: new Date()
    };
    session.messages.push(assistantMsgObj);

    // Record newly recommended tracks into persistent context
    const updatedTrackIds = new Set(sessionTrackIds);
    const updatedTrackKeys = new Set(sessionTrackKeys);
    if (Array.isArray(companionResult.recommendations)) {
      for (const t of companionResult.recommendations) {
        const id = String(t.id || t._id || t.songId || '');
        if (id) updatedTrackIds.add(id);
        const { key } = normalizeTrackKey(t.title, t.artist);
        if (key) updatedTrackKeys.add(key);
      }
    }

    // Update conversation context
    session.context = {
      ...runtimeContext,
      ...(companionResult.contextUpdate || {}),
      recommendedTrackIds: Array.from(updatedTrackIds),
      recommendedTrackKeys: Array.from(updatedTrackKeys),
      lastRecommendedSongs: (companionResult.recommendations && companionResult.recommendations.length > 0)
        ? companionResult.recommendations
        : (session.context?.lastRecommendedSongs || [])
    };
    session.markModified('context');

    // Handle automated favorite action if commanded
    if (companionResult.action && (companionResult.action.type === 'FAVORITE_SONG' || companionResult.action.type === 'FAVORITE_UPDATED') && companionResult.action.song) {
      try {
        const s = companionResult.action.song;
        const songId = s._id || s.id;
        const exists = await Favorite.findOne({ userId: req.user.id, songId: String(songId) });
        if (!exists) {
          await Favorite.create({
            userId: req.user.id,
            songId: String(songId),
            externalData: s
          });
        }
      } catch (favErr) {
        console.warn('Auto favorite error:', favErr.message);
      }
    }

    // Handle taste preference update if commanded
    if (companionResult.action && companionResult.action.type === 'UPDATE_PREFERENCES' && companionResult.action.preferences) {
      try {
        const updateFields = companionResult.action.preferences;
        if (user) {
          if (!user.preferences) user.preferences = {};
          if (Array.isArray(updateFields.favoriteGenres)) user.preferences.favoriteGenres = updateFields.favoriteGenres;
          if (Array.isArray(updateFields.favoriteArtists)) user.preferences.favoriteArtists = updateFields.favoriteArtists;
          if (updateFields.energyLevel) user.preferences.energyLevel = updateFields.energyLevel;
          if (Array.isArray(updateFields.preferredMoods)) user.preferences.preferredMoods = updateFields.preferredMoods;
          if (Array.isArray(updateFields.favoriteListeningModes)) user.preferences.favoriteListeningModes = updateFields.favoriteListeningModes;
          user.preferences.updatedAt = new Date();
          await user.save();
        }
      } catch (prefErr) {
        console.warn('Taste preference update in chat error:', prefErr.message);
      }
    }

    await session.save();

    res.status(200).json({
      message: assistantMsgObj,
      action: companionResult.action,
      session
    });
  } catch (error) {
    console.error('sendChatMessage error:', error.message);
    res.status(500).json({ message: 'Server error processing chat message' });
  }
};

/**
 * Delete chat session
 */
export const deleteChatSession = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID format' });
    }

    const session = await ChatSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    if (!req.user || session.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: cannot delete another user\'s chat session' });
    }

    await ChatSession.findByIdAndDelete(id);
    res.status(200).json({ message: 'Chat session deleted successfully' });
  } catch (error) {
    console.error('deleteChatSession error:', error.message);
    res.status(500).json({ message: 'Server error deleting chat session' });
  }
};
