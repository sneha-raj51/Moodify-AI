import express from 'express';
import { getMoods, createMood, deleteMood, clearAllMoods, getMoodAnalytics } from '../controllers/moodController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/analytics', requireAuth, getMoodAnalytics);

router.route('/')
  .get(getMoods)
  .post(createMood)
  .delete(requireAuth, clearAllMoods);

router.route('/:id')
  .delete(requireAuth, deleteMood);

export default router;
