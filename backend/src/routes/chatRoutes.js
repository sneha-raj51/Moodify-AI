import express from 'express';
import {
  getChatSessions,
  createChatSession,
  getChatSessionById,
  sendChatMessage,
  deleteChatSession
} from '../controllers/chatController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.route('/sessions')
  .get(getChatSessions)
  .post(createChatSession);

router.route('/sessions/:id')
  .get(getChatSessionById)
  .delete(deleteChatSession);

router.route('/sessions/:id/messages')
  .post(sendChatMessage);

export default router;
