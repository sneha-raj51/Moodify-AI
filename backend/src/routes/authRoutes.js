import express from 'express';
import { 
  registerUser, 
  loginUser, 
  getProfile,
  forgotPassword,
  resetPassword,
  getPreferences,
  updatePreferences
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

router.get('/profile', requireAuth, getProfile);
router.route('/preferences')
  .get(requireAuth, getPreferences)
  .put(requireAuth, updatePreferences);

export default router;

