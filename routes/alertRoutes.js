import express from 'express';
import { createAlert, getAlerts, getSummary, getTrends, getAlertHistory, resolveAlert } from '../controllers/alertController.js';
import authenticate from '../middleware/authMiddleware.js';

const router = express.Router();

// every alert route goes through authenticate first — unauthenticated ingestion would
// make the whole rule engine trivially abusable from the outside
router.get('/summary', authenticate, getSummary);
router.get('/trends', authenticate, getTrends);
router.get('/', authenticate, getAlerts);
router.get('/:id/history', authenticate, getAlertHistory);
router.post('/', authenticate, createAlert);
router.patch('/:id/resolve', authenticate, resolveAlert);

export default router;
