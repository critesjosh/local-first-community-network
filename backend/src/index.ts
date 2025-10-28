/**
 * Local Community Network - Backend API Server
 *
 * This server stores encrypted posts and cannot decrypt them.
 * It acts as a relay/sync server for encrypted data.
 */

import express, {Express, Request, Response} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import postRoutes from './routes/posts.js';
import threadRoutes from './routes/threads.js';
import {healthCheckLimiter} from './middleware/rateLimitMiddleware.js';
import {pool} from './config/database.js';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security headers
app.use(helmet());

// Request logging
if (NODE_ENV === 'production') {
  // Production: log only errors and important info
  app.use(morgan('combined'));
} else {
  // Development: log all requests
  app.use(morgan('dev'));
}

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*', // In production, set ALLOWED_ORIGINS env var
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Body parsing with size limit
app.use(express.json({limit: '10mb'})); // Support large base64 images

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Health check endpoint with rate limiting
app.get('/health', healthCheckLimiter, async (req: Request, res: Response) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'local-community-backend',
      environment: NODE_ENV,
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'local-community-backend',
      environment: NODE_ENV,
      database: 'disconnected',
    });
  }
});

// API Routes
app.use('/api/posts', postRoutes);
app.use('/api/threads', threadRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({error: 'Not found'});
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Local Community Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📮 Posts API: http://localhost:${PORT}/api/posts`);
  console.log(`💬 Threads API: http://localhost:${PORT}/api/threads`);
});

export default app;
