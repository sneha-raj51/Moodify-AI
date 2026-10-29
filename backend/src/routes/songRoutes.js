import express from 'express';
import { getSongs, getSongById, createSong, searchSongs, resolveYouTube } from '../controllers/songController.js';

const router = express.Router();

router.get('/search', searchSongs);
router.get('/resolve-youtube', resolveYouTube);

router.route('/')
  .get(getSongs)
  .post(createSong);

router.route('/:id')
  .get(getSongById);

export default router;
