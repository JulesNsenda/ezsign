// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import helmet from 'helmet';
import morgan from 'morgan';
import { createAuthRouter } from '@/routes/auth';
import { createDocumentRouter } from '@/routes/documentRoutes';
import { createTeamsRouter } from '@/routes/teams';
import { createApiKeysRouter } from '@/routes/apiKeys';
import { createTemplateRouter } from '@/routes/templateRoutes';
import { createSigningRouter, createDocumentSigningRouter } from '@/routes/signingRoutes';
import { createWebhookRouter } from '@/routes/webhooks';
import { errorHandler } from '@/middleware/errorHandler';
import { apiLimiter } from '@/middleware/rateLimiter';
import { createWebhookWorker } from '@/workers/webhookWorker';

// Environment variables
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Database configuration
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'ezsign',
  user: process.env.DATABASE_USER || 'ezsign',
  password: process.env.DATABASE_PASSWORD || 'ezsign_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Initialize database connection pool
const pool = new Pool(dbConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
    process.exit(1);
  } else {
    console.log('✓ Database connected successfully');
    release();
  }
});

// Initialize webhook worker for background delivery processing
const webhookWorker = createWebhookWorker(pool);
console.log('✓ Webhook worker initialized');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// Request logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use(apiLimiter);

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', createAuthRouter(pool));
app.use('/api/documents', createDocumentRouter(pool));
app.use('/api/documents', createDocumentSigningRouter(pool)); // Signing operations on documents
app.use('/api/teams', createTeamsRouter(pool));
app.use('/api/api-keys', createApiKeysRouter(pool));
app.use('/api/templates', createTemplateRouter(pool));
app.use('/api/webhooks', createWebhookRouter(pool));
app.use('/api/signing', createSigningRouter(pool)); // Public signing links

// API documentation placeholder
app.get('/api/docs', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      documents: '/api/documents',
      teams: '/api/teams',
      apiKeys: '/api/api-keys',
      templates: '/api/templates',
      webhooks: '/api/webhooks',
      signing: '/api/signing',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${NODE_ENV}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ API docs: http://localhost:${PORT}/api/docs`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await webhookWorker.close();
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await webhookWorker.close();
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

export default app;
