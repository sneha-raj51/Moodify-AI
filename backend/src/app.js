import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';
import songRoutes from './routes/songRoutes.js';
import favoriteRoutes from './routes/favoriteRoutes.js';
import moodRoutes from './routes/moodRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import configRoutes from './routes/configRoutes.js';
import authRoutes from './routes/authRoutes.js';
import mlRoutes from './routes/mlRoutes.js';
import playlistRoutes from './routes/playlistRoutes.js';
import lyricsRoutes from './routes/lyricsRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import { optionalAuth } from './middleware/authMiddleware.js';

const app = express();

const getCorsOrigin = () => {
  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? false : true;
  }
  if (configured === '*') {
    // Reflect origin to comply with credentials: true
    return true;
  }
  const origins = configured.split(',').map(o => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

app.use(cors({
  origin: getCorsOrigin(),
  credentials: true
}));
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/moods', optionalAuth, moodRoutes);
app.use('/api/ai', optionalAuth, aiRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/config', configRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/lyrics', lyricsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/profile', profileRoutes);

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

export default app;
