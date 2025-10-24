/**
 * Local Community Network - Backend API Server
 *
 * This server stores encrypted posts and cannot decrypt them.
 * It acts as a relay/sync server for encrypted data.
 */

import express, {Express, Request, Response} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import postRoutes from './routes/posts';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({limit: '10mb'})); // Support large base64 images

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'local-community-backend',
  });
});

// API Routes
app.use('/api/posts', postRoutes);

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
});

export default app;
