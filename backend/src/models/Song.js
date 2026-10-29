import mongoose from 'mongoose';

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Song title is required'],
    trim: true,
  },
  artist: {
    type: String,
    required: [true, 'Song artist is required'],
    trim: true,
  },
  genre: {
    type: String,
    trim: true,
  },
  mood: {
    type: String,
    trim: true,
  },
  albumArt: {
    type: String,
    trim: true,
  },
  audioUrl: {
    type: String,
    trim: true,
  },
  language: {
    type: String,
    trim: true,
    default: null,
  },
  provider: {
    type: String,
    trim: true,
    default: 'mongodb',
  },
  isPlayable: {
    type: Boolean,
    default: false,
  },
  album: {
    type: String,
    trim: true,
  },
  duration: {
    type: Number,
    default: 30,
  },
  moods: [{
    type: String,
    trim: true,
  }],
  playbackType: {
    type: String,
    enum: ['full', 'preview', 'none'],
    default: 'preview',
  },
  youtubeId: {
    type: String,
    trim: true,
  },
  previewUrl: {
    type: String,
    trim: true,
  },
  externalUrl: {
    type: String,
    trim: true,
  },
  lyrics: {
    plain: { type: String, default: null },
    synced: { type: String, default: null },
    source: { type: String, default: null },
  },
  lyricsAvailable: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true
});

songSchema.index({ title: 'text', artist: 'text', album: 'text' }, { language_override: 'text_search_language' });
songSchema.index({ mood: 1, language: 1 });
songSchema.index({ youtubeId: 1 });

const Song = mongoose.model('Song', songSchema);

export default Song;
