import express from 'express';
import multer from 'multer';
import { predictEmotion, getMlEvaluationMetrics } from '../controllers/mlController.js';

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

router.post('/predict', upload.single('file'), predictEmotion);
router.get('/evaluation-metrics', getMlEvaluationMetrics);

export default router;
