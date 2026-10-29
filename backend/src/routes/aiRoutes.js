import express from 'express';
import { getRecommendations, getMoodTransitionRecommendations } from '../controllers/aiController.js';
import { logRecommendationEvent, getRecommendationEvaluation } from '../controllers/evaluationController.js';

const router = express.Router();

router.post('/recommend', getRecommendations);
router.post('/recommend/transition', getMoodTransitionRecommendations);

// Feature 8: Recommendation Event Tracking & Evaluation Dashboard
router.post('/events', logRecommendationEvent);
router.get('/evaluation', getRecommendationEvaluation);

export default router;
