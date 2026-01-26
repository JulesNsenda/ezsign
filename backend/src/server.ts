// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Pool } from 'pg';
import helmet from 'helmet';
import morgan from 'morgan';
import { socketService } from '@/services/socketService';
import { createAuthRouter } from '@/routes/auth';
import { createDocumentRouter } from '@/routes/documentRoutes';
import { createTeamsRouter } from '@/routes/teams';
import { createApiKeysRouter } from '@/routes/apiKeys';
import { createTemplateRouter } from '@/routes/templateRoutes';
import { createSigningRouter, createDocumentSigningRouter } from '@/routes/signingRoutes';
import { createWebhookRouter } from '@/routes/webhooks';
import { createPdfRouter } from '@/routes/pdfRoutes';
import { createHealthRoutes } from '@/routes/health';
import { createTwoFactorRouter } from '@/routes/twoFactor';
import { createEmailLogRouter, createEmailWebhookRouter } from '@/routes/emailLogRoutes';
import { HealthService } from '@/services/healthService';
import { errorHandler } from '@/middleware/errorHandler';
import { apiLimiter } from '@/middleware/rateLimiter';
import { correlationIdMiddleware } from '@/middleware/correlationId';
import { createWebhookWorker } from '@/workers/webhookWorker';
import { createPdfWorker } from '@/workers/pdfWorker';
import { createCleanupWorker, createCleanupQueue, scheduleCleanupJobs } from '@/workers/cleanupWorker';
import { createScheduledSendWorker } from '@/workers/scheduledSendWorker';
import { createReminderWorker } from '@/workers/reminderWorker';
import { getRedisConnection } from '@/config/queue';
import { shutdownManager } from '@/services/shutdownManager';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import { closeRateLimitRedis } from '@/middleware/rateLimiter';
import logger from '@/services/loggerService';

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
pool.connect((err, _client, release) => {
  if (err) {
    logger.error('Error connecting to the database', { error: err.message, stack: err.stack });
    process.exit(1);
  } else {
    logger.info('Database connected successfully');
    release();
  }
});

// Initialize webhook worker for background delivery processing
const webhookWorker = createWebhookWorker(pool);
logger.info('Webhook worker initialized');

// Initialize PDF worker for background PDF processing
const pdfWorker = createPdfWorker(pool);
logger.info('PDF worker initialized');

// Initialize cleanup worker for file cleanup
const cleanupWorker = createCleanupWorker(pool);
const cleanupQueue = createCleanupQueue();
logger.info('Cleanup worker initialized');

// Initialize scheduled send worker for delayed document sending
const scheduledSendWorker = createScheduledSendWorker(pool);
logger.info('Scheduled send worker initialized');

// Initialize reminder worker for deadline reminders
const reminderWorker = createReminderWorker(pool);
logger.info('Reminder worker initialized');

// Schedule cleanup jobs (async, don't await - let server start)
scheduleCleanupJobs(cleanupQueue).catch((error) => {
  logger.error('Failed to schedule cleanup jobs', { error: (error as Error).message });
});

// Initialize Redis connection for health checks
const healthRedis = getRedisConnection();
logger.info('Redis connection for health checks initialized');

// Initialize health service
const healthService = new HealthService(pool, healthRedis);
logger.info('Health service initialized');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// Add correlation ID to all requests (must be early in middleware chain)
app.use(correlationIdMiddleware);

// Request logging using morgan with winston integration
const morganFormat = NODE_ENV === 'development' ? 'dev' : 'combined';
const morganStream = {
  write: (message: string) => {
    // Remove trailing newline and log at http level
    logger.http(message.trim());
  },
};
app.use(morgan(morganFormat, { stream: morganStream }));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use(apiLimiter);

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
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
    res.sendStatus(200);
    return;
  }

  next();
});

// Health check routes (before rate limiting to ensure they always respond)
app.use('/health', createHealthRoutes(healthService));

// API routes
app.use('/api/auth', createAuthRouter(pool));
app.use('/api/auth/2fa', createTwoFactorRouter(pool)); // Two-factor authentication
app.use('/api/documents', createDocumentRouter(pool));
app.use('/api/documents', createDocumentSigningRouter(pool)); // Signing operations on documents
app.use('/api/teams', createTeamsRouter(pool));
app.use('/api/api-keys', createApiKeysRouter(pool));
app.use('/api/templates', createTemplateRouter(pool));
app.use('/api/webhooks', createWebhookRouter(pool));
app.use('/api/webhooks', createEmailWebhookRouter(pool)); // Email delivery webhooks
app.use('/api/pdf', createPdfRouter(pool)); // PDF processing endpoints
app.use('/api/signing', createSigningRouter(pool)); // Public signing links
app.use('/api/admin/emails', createEmailLogRouter(pool)); // Email logs (admin)

// API documentation placeholder
app.get('/api/docs', (_req: Request, res: Response) => {
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
      pdf: '/api/pdf',
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

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
socketService.initialize(httpServer, pool);

// Start server
const server = httpServer.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: NODE_ENV,
    healthCheck: `http://localhost:${PORT}/health`,
    apiDocs: `http://localhost:${PORT}/api/docs`,
    websocket: `ws://localhost:${PORT}`,
  });
});

// Register resources for graceful shutdown
// Resources are closed in reverse order of registration (LIFO)
// Use priority to control order within same registration level

// Priority 100: HTTP server and WebSocket (stop accepting new connections first)
shutdownManager.register({
  name: 'HTTP Server',
  priority: 100,
  close: () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    }),
});

shutdownManager.register({
  name: 'Socket.IO',
  priority: 100,
  close: async () => {
    const io = socketService.getIO();
    if (io) {
      io.close();
    }
  },
});

// Priority 50: Background workers (let them finish current jobs)
shutdownManager.register({
  name: 'Webhook Worker',
  priority: 50,
  close: () => webhookWorker.close(),
});

shutdownManager.register({
  name: 'PDF Worker',
  priority: 50,
  close: () => pdfWorker.close(),
});

shutdownManager.register({
  name: 'Cleanup Worker',
  priority: 50,
  close: () => cleanupWorker.close(),
});

shutdownManager.register({
  name: 'Cleanup Queue',
  priority: 50,
  close: () => cleanupQueue.close(),
});

shutdownManager.register({
  name: 'Scheduled Send Worker',
  priority: 50,
  close: () => scheduledSendWorker.close(),
});

shutdownManager.register({
  name: 'Reminder Worker',
  priority: 50,
  close: () => reminderWorker.close(),
});

// Priority 25: Application services
shutdownManager.register({
  name: 'Token Blacklist Service',
  priority: 25,
  close: () => tokenBlacklistService.close(),
});

shutdownManager.register({
  name: 'Rate Limit Redis',
  priority: 25,
  close: () => closeRateLimitRedis(),
});

// Priority 10: Redis connections
shutdownManager.register({
  name: 'Health Redis',
  priority: 10,
  close: async () => {
    await healthRedis.quit();
  },
});

// Priority 0: Database (close last)
shutdownManager.register({
  name: 'Database Pool',
  priority: 0,
  close: () =>
    new Promise<void>((resolve) => {
      pool.end(() => resolve());
    }),
});

// Install signal handlers for graceful shutdown
shutdownManager.installSignalHandlers();

export default app;
