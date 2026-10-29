import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String, index: true },
  songId: {
    type: String,
    required: [true, 'Song ID is required for a favorite'],
  },
  externalData: {
    type: Object,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Ensure an authenticated user can only favorite a song once, and guests with session IDs can only favorite once per session
favoriteSchema.index({ userId: 1, songId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
favoriteSchema.index({ sessionId: 1, songId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $type: 'string' } } });

const Favorite = mongoose.model('Favorite', favoriteSchema);

export default Favorite;
