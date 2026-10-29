import express from 'express';
import { getFavorites, addFavorite, removeFavorite } from '../controllers/favoriteController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication on all Favorites operations
router.use(requireAuth);

router.route('/')
  .get(getFavorites)
  .post(addFavorite);

router.route('/:id')
  .delete(removeFavorite);

export default router;
