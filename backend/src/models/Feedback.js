import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  songId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['like', 'dislike', 'skip', 'complete'],
    required: true
  },
  title: {
    type: String,
    default: 'Unknown Title'
  },
  artist: {
    type: String,
    default: 'Unknown Artist'
  },
  genre: String,
  mood: String,
  source: {
    type: String,
    default: 'mongodb'
  },
  externalId: String
}, {
  timestamps: true
});

// Compound unique index to strictly prevent duplicate event inflation
feedbackSchema.index({ userId: 1, songId: 1, action: 1 }, { unique: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
