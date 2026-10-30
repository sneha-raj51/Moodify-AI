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

export const isOriginAllowed = (origin) => {
  // Allow non-browser requests (e.g. curl, health checks, server-to-server)
  if (!origin) return true;

  // Support both singular and plural environment variable naming for Render compatibility
  const configured = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  if (configured === '*') return true;

  const allowedList = configured
    ? configured.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
    : [];

  // Always ensure the canonical production Vercel frontend URL is explicitly permitted
  const defaultAllowed = [
    'https://moodify-ai-nine.vercel.app',
    'https://moodify-ai.vercel.app'
  ];
  for (const def of defaultAllowed) {
    if (!allowedList.includes(def)) {
      allowedList.push(def);
    }
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, '');

  // Match explicitly configured origins
  if (allowedList.includes(normalizedOrigin)) {
    return true;
  }

  // Allow any Vercel deployment (production, preview, and branch deploys)
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'vercel.app' || parsed.hostname.endsWith('.vercel.app'))) {
      return true;
    }
  } catch (e) {
    // Malformed origin
  }

  // Allow local development origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
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
