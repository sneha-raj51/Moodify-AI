import express from 'express';
import {
  getUserPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  generateSmartPlaylist
} from '../controllers/playlistController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Smart Playlist Generation (available to both authenticated users and guests)
router.post('/smart/generate', optionalAuth, generateSmartPlaylist);

// Standard Playlist Management (requires authentication)
router.use(requireAuth);

router.route('/')
  .get(getUserPlaylists)
  .post(createPlaylist);

router.route('/:id')
  .get(getPlaylistById)
  .put(updatePlaylist)
  .delete(deletePlaylist);

router.route('/:id/songs')
  .post(addSongToPlaylist);

router.route('/:id/songs/:songId')
  .delete(removeSongFromPlaylist);

export default router;
