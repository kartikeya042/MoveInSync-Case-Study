import express from 'express';
import mongoose from 'mongoose';
import 'dotenv/config';
import alertRoutes from './routes/alertRoutes.js';

const app = express();
app.use(express.json());

app.use('/api/alerts', alertRoutes);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alert-escalation';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('connected to mongodb');
    app.listen(PORT, () => {
      console.log(`server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('mongodb connection failed:', err);
    process.exit(1); // no db, no point running
  });

export default app;
