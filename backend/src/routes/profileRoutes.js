import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getTasteProfile,
  updateTasteProfile,
  resetInferredTaste
} from '../controllers/tasteProfileController.js';

const router = express.Router();

// Personal Music Taste Profile endpoints (Phase 2 & Phase 3)
router.route('/taste')
  .get(requireAuth, getTasteProfile)
  .put(requireAuth, updateTasteProfile);

router.post('/taste/reset-inferred', requireAuth, resetInferredTaste);

export default router;
