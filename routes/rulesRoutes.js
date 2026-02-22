import express from 'express';
import { getRulesConfig } from '../controllers/rulesController.js';
import authenticate from '../middleware/authMiddleware.js';

const router = express.Router();

// admin-only view of active thresholds — still behind auth so random users can't use it.
router.get('/config', authenticate, getRulesConfig);

export default router;
