import express from 'express';
import { getHealthStatus, getDbStatus } from '../controllers/healthController.js';

const router = express.Router();

router.get('/', getHealthStatus);
router.get('/db', getDbStatus);

export default router;
