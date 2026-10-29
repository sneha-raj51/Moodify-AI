import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  text: {
    type: String,
    required: true
  },
  quickReplies: {
    type: [String],
    default: []
  },
  recommendations: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    default: 'New Music Chat'
  },
  messages: {
    type: [messageSchema],
    default: []
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      currentMood: null,
      genre: null,
      language: null,
      energy: null,
      listeningMode: null,
      recommendedTrackIds: [],
      recommendedTrackKeys: [],
      lastRecommendedSongs: [],
      lastGeneratedPlaylist: null,
      activePlaylist: null,
      explicitConstraints: {}
    })
  }
}, {
  timestamps: true
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
export default ChatSession;
