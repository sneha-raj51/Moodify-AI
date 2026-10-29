import mongoose from 'mongoose';

const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String, index: true },
  songId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  artist: {
    type: String,
    required: true,
  },
  cover: String,
  genre: String,
  mood: String,
  source: String,
  audioUrl: String,
  isPlayable: { type: Boolean, default: false },
  listenedDuration: { type: Number, default: 0 },
  isMeaningful: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  skipped: { type: Boolean, default: false }
}, {
  timestamps: true
});

const History = mongoose.model('History', historySchema);
export default History;
