import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  recordFeedback, 
  getFeedback, 
  deleteFeedback, 
  getFeedbackSummary 
} from '../controllers/feedbackController.js';

const router = express.Router();

router.use(protect); // Enforce authentication on all feedback endpoints

router.post('/', recordFeedback);
router.get('/', getFeedback);
router.get('/summary', getFeedbackSummary);
router.delete('/:songId', deleteFeedback);

export default router;
