import mongoose from 'mongoose';

const moodHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mood: {
    type: String,
    required: [true, 'Mood is required'],
    trim: true,
  },
  note: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1000
  },
  source: {
    type: String,
    enum: {
      values: ['manual', 'face-detected', 'face-confirmed', 'journal-entry', 'voice', 'other'],
      message: '{VALUE} is not a supported source'
    },
    default: 'manual',
    required: true,
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

moodHistorySchema.index({ userId: 1, createdAt: -1 });

const MoodHistory = mongoose.model('MoodHistory', moodHistorySchema);

export default MoodHistory;
