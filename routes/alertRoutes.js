import express from 'express';
import { createAlert } from '../controllers/alertController.js';

const router = express.Router();

router.post('/', createAlert);

export default router;
