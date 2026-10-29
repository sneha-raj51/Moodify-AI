import mongoose from 'mongoose';

const playlistSongSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  artist: { type: String, required: true },
  albumArt: String,
  cover: String,
  audioUrl: String,
  isPlayable: { type: Boolean, default: false },
  duration: { type: Number, default: 30 },
  playbackType: { type: String, enum: ['preview', 'full'], default: 'preview' },
  isFullAudio: { type: Boolean, default: false },
  previewLabel: { type: String, default: '30-sec Preview' },
  sourceLabel: { type: String, default: 'Moodify' },
  explanation: { type: String, default: '' },
  genre: String,
  mood: String,
  language: String,
  source: String,
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const playlistSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    required: [true, 'Playlist name is required'], 
    trim: true,
    maxlength: [100, 'Playlist name cannot exceed 100 characters']
  },
  description: { 
    type: String, 
    trim: true, 
    default: '',
    maxlength: [500, 'Playlist description cannot exceed 500 characters']
  },
  coverArt: { 
    type: String, 
    default: '' 
  },
  isPublic: { 
    type: Boolean, 
    default: false 
  },
  songs: [playlistSongSchema]
}, {
  timestamps: true
});

playlistSchema.index({ userId: 1 });

const Playlist = mongoose.model('Playlist', playlistSchema);

export default Playlist;
