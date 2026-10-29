import express from 'express';
import { getJamendoConfig, getProvidersConfig } from '../controllers/configController.js';

const router = express.Router();

router.route('/jamendo').get(getJamendoConfig);
router.route('/providers').get(getProvidersConfig);

export default router;
