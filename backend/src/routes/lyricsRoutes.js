import express from 'express';
import { getLyrics } from '../services/lyricsService.js';

const router = express.Router();

/**
 * GET /api/lyrics?title=...&artist=...&duration=...
 */
router.get('/', async (req, res) => {
  try {
    const { title, artist, duration } = req.query;
    if (!title) {
      return res.status(400).json({ message: 'Title is required', lyricsAvailable: false });
    }

    const lyricsData = await getLyrics(title, artist, duration ? Number(duration) : null);
    res.status(200).json(lyricsData);
  } catch (err) {
    console.error('Lyrics route error:', err.message);
    res.status(500).json({
      plain: null,
      synced: null,
      lyricsAvailable: false,
      message: 'Failed to retrieve lyrics.'
    });
  }
});

export default router;
