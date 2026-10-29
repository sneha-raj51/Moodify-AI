import express from 'express';
import { logListen, getHistory, updateListen, getListeningRecap, clearHistory, getMoodJournal } from '../controllers/historyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce authentication on all History & Recap operations
router.use(requireAuth);

router.get('/recap', getListeningRecap);
router.get('/journal', getMoodJournal);

router.route('/')
  .get(getHistory)
  .post(logListen)
  .delete(clearHistory);

router.route('/:id')
  .put(updateListen);

export default router;
