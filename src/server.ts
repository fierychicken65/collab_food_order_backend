import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { initDb } from './db/db.js';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    const orm = await initDb();
    const isConnected = await orm.isConnected();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: isConnected ? 'connected' : 'disconnected',
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error?.message || 'Database connection error',
    });
  }
});

const server = http.createServer(app);

async function startServer() {
  try {
    await initDb();
    console.log('Connected to PostgreSQL successfully.');

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server };
