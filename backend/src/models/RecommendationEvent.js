import mongoose from 'mongoose';

const recommendationEventSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true 
  },
  sessionId: { 
    type: String, 
    index: true 
  },
  eventId: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  eventType: { 
    type: String, 
    enum: ['impression', 'click', 'play', 'like', 'dislike', 'skip', 'favorite', 'complete'], 
    required: true,
    index: true
  },
  songId: { 
    type: String, 
    required: true,
    index: true
  },
  title: { 
    type: String, 
    default: 'Unknown Track' 
  },
  artist: { 
    type: String, 
    default: 'Unknown Artist' 
  },
  genre: {
    type: String,
    default: 'General'
  },
  mood: {
    type: String,
    default: 'Neutral'
  },
  source: { 
    type: String, 
    default: 'ai-recommendation' 
  },
  metadata: { 
    type: mongoose.Schema.Types.Mixed, 
    default: {} 
  }
}, {
  timestamps: true
});

recommendationEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
recommendationEventSchema.index({ createdAt: -1 });

const RecommendationEvent = mongoose.model('RecommendationEvent', recommendationEventSchema);

export default RecommendationEvent;
