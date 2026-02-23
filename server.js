import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';
import alertRoutes from './routes/alertRoutes.js';
import authRoutes from './routes/authRoutes.js';
import rulesRoutes from './routes/rulesRoutes.js';
import { startAutoCloseWorker } from './jobs/autoCloseWorker.js';

const app = express();

// allow the frontend origin — set CORS_ORIGIN in the render env vars to your vercel url
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/rules', rulesRoutes);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alert-escalation';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('connected to mongodb');
    app.listen(PORT, () => {
      console.log(`server running on port ${PORT}`);
    });
    // start after db is ready — the worker queries on startup, so mongoose must be connected first.
    startAutoCloseWorker();
  })
  .catch((err) => {
    console.error('mongodb connection failed:', err);
    process.exit(1); // no db, no point running
  });

export default app;
