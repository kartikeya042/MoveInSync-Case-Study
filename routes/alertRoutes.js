import express from 'express';
import { createAlert, getTrends, getAlertHistory } from '../controllers/alertController.js';
import authenticate from '../middleware/authMiddleware.js';

const router = express.Router();

// every alert route goes through authenticate first — unauthenticated ingestion would
// make the whole rule engine trivially abusable from the outside
router.get('/trends', authenticate, getTrends);
router.get('/:id/history', authenticate, getAlertHistory);
router.post('/', authenticate, createAlert);

export default router;
