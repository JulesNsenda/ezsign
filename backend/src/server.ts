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
import { createAdminDlqRouter } from '@/routes/adminDlqRoutes';
import { createAdminStatsRouter } from '@/routes/adminStatsRoutes';
import { createAdminSettingsRouter } from '@/routes/adminSettingsRoutes';
import { createAdminUsersRouter } from '@/routes/adminUsersRoutes';
import { createBrandingRouter, createPublicBrandingRouter } from '@/routes/brandingRoutes';
import { createTeamInvitationsRouter, createInvitationsRouter } from '@/routes/invitations';
import utilityRoutes from '@/routes/utilityRoutes';
import { getStorageService, verifyStorageRoot } from '@/config/storage';
import { HealthService } from '@/services/healthService';
import { errorHandler } from '@/middleware/errorHandler';
import { apiLimiter } from '@/middleware/rateLimiter';
import { correlationIdMiddleware } from '@/middleware/correlationId';
import { rawBodyJsonParser } from '@/middleware/rawBody';
import { createWebhookWorker } from '@/workers/webhookWorker';
import { createPdfWorker } from '@/workers/pdfWorker';
import { createCleanupWorker } from '@/workers/cleanupWorker';
import { createScheduledSendWorker } from '@/workers/scheduledSendWorker';
import { createReminderWorker } from '@/workers/reminderWorker';
import { startQueues, stopQueues } from '@/config/queue';
import { shutdownManager } from '@/services/shutdownManager';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import { createMonitoredPool, logQueryStatsSummary } from '@/services/databaseService';
import { initializeFieldTableService } from '@/services/fieldTableService';
import { ensureAdminExists } from '@/services/adminBootstrapService';
import logger from '@/services/loggerService';

// Environment variables
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// G7: `docker-compose.dev.yml` ships a committed WEBHOOK_SECRET default,
// which is now security-load-bearing (it HMAC-gates the inbound email-
// delivery webhook - see emailLogController.handleDeliveryWebhook). Warn
// loudly rather than silently accept it: that value is public in the
// repository, so any deployment still running it has an attacker-known
// webhook secret.
const DEV_WEBHOOK_SECRET_DEFAULT = 'dev-webhook-secret-change-in-production';
if (process.env.WEBHOOK_SECRET === DEV_WEBHOOK_SECRET_DEFAULT) {
  logger.warn(
    'WEBHOOK_SECRET is set to the committed docker-compose.dev.yml default value - change it before exposing this instance; that value is public in the repository history.'
  );
}

// Database configuration
// Prefer DATABASE_URL (e.g. injected by a hosting platform) over discrete vars
//
// TLS verification defaults to ON (rejectUnauthorized: true) when
// DATABASE_SSL=true: use DATABASE_CA to pin the server's CA cert (common for
// managed Postgres), or set DATABASE_SSL_REJECT_UNAUTHORIZED=false as an
// explicit escape hatch (e.g. for a self-signed cert you can't pin) - never
// silently disabled.
const databaseSsl =
  process.env.DATABASE_SSL === 'true'
    ? process.env.DATABASE_CA
      ? { ca: process.env.DATABASE_CA }
      : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined;

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: databaseSsl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'ezsign',
      user: process.env.DATABASE_USER || 'ezsign',
      password: process.env.DATABASE_PASSWORD || 'ezsign_password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

// Initialize database connection pool with monitoring
const rawPool = new Pool(dbConfig);

// REQUIRED, not defensive. node-postgres emits 'error' on the Pool when a
// client that is sitting IDLE in the pool loses its connection, and its docs
// are explicit that an unhandled one crashes the process. Without this, an
// error on an idle client became an uncaughtException, which shutdownManager
// (correctly) treats as fatal and shuts the app down.
//
// That is not hypothetical: on 2026-07-30 at 14:03 UTC PostgreSQL was
// restarted underneath us and every pooled connection got
// `57P01 terminating connection due to administrator command`. The app shut
// itself down cleanly and never came back — the whole group's hostname stopped
// serving until someone restarted it by hand. The platform bounces PostgreSQL
// on every deploy, so this was guaranteed to recur.
//
// Handling it here is all that is needed to survive it: pg discards the broken
// client and opens a fresh one on the next checkout, so in-flight requests see
// one error and everything after reconnects. Deliberately NOT rethrown and
// deliberately not a shutdown — a transient database bounce is exactly the
// thing a pool exists to absorb.
rawPool.on('error', (err: Error & { code?: string }) => {
  logger.error('Idle database client error; pool will reconnect', {
    error: err.message,
    code: err.code,
  });
});

const pool = createMonitoredPool(rawPool);

// Token revocation store (Postgres-backed; reads fail closed)
tokenBlacklistService.init(pool);

// Initialize field table service
initializeFieldTableService(pool);

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

// Ensure a super admin user exists (first-boot bootstrap). Fire-and-forget:
// the lock inside makes ordering relative to server startup irrelevant.
ensureAdminExists(pool).catch((err) => logger.error('Admin bootstrap failed', err));

// Start the pg-boss queue system (creates queues + cron schedules), then
// register all workers. Fire-and-forget like the bootstrap above: HTTP can
// serve before queues are up, but a startup failure is loud in the logs.
(async () => {
  await startQueues(pool);
  await Promise.all([
    createWebhookWorker(pool),
    createPdfWorker(pool),
    createCleanupWorker(pool),
    createScheduledSendWorker(pool),
    createReminderWorker(pool),
  ]);
  logger.info('Queue system started: 5 workers registered (pg-boss)');
})().catch((err) => {
  logger.error('Queue system failed to start - background jobs are DOWN', {
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
});

// Initialize health service
const healthService = new HealthService(pool);
logger.info('Health service initialized');

// Initialize Express app
const app = express();

// Behind DROP's (and any other) reverse proxy, the socket peer is the proxy, so
// `req.ip` would be the proxy's address and EVERY client would share a single
// rate-limit bucket. Trust exactly one proxy hop so `req.ip` resolves to the
// real client from X-Forwarded-For. Do NOT raise this to `true`/a larger hop
// count without a proxy that strips client-supplied X-Forwarded-For headers -
// that would let a client spoof its own IP and evade rate limiting.
app.set('trust proxy', 1);

// Security middleware with custom configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    // Disable cross-origin resource policy to allow images/logos to load from different origins
    crossOriginResourcePolicy: false,
  })
);

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

// CORS middleware
// Must run before body parsing and rate limiting so that 413 (payload too
// large) and 429 (rate limited) responses still carry
// Access-Control-Allow-Origin - otherwise they reach the browser as an
// opaque network error instead of a readable response.
app.use((req: Request, res: Response, next: NextFunction): void => {
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin;

  // Allow-Credentials/Methods/Headers, and the OPTIONS-preflight short
  // circuit, must only be emitted for an origin that's actually on the
  // allowlist - otherwise a disallowed origin's preflight still gets a
  // permissive-looking 200 (Allow-Origin just happens to be absent). Nest
  // all of it inside the allowlist check so a disallowed origin instead
  // falls through to normal routing (and its 404/401 fate) with no CORS
  // headers at all.
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // The response varies per request Origin - tell caches not to reuse one
    // origin's (pre)response for another.
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
  }

  next();
});

// G6: the email delivery status webhook needs `req.rawBody` (the exact bytes
// the sender HMAC-signed) to verify its signature - previously the global
// 50mb JSON parser below captured that Buffer on *every* JSON request via a
// `verify` callback, pinning it to `req` for the whole request lifetime even
// though `submitSignature` alone (up to 50 base64 signatures) routinely
// carries multi-MB bodies, roughly doubling peak memory for a route that
// receives no comparable traffic. Scoped instead to just this path, ahead of
// the global parser: body-parser's JSON middleware (which express.json()
// wraps) skips re-parsing a request whose body is already parsed, so the
// global parser below is a no-op here.
app.use('/api/webhooks/email-status', rawBodyJsonParser);

// Body parsing middleware for everything else.
app.use(
  express.json({
    limit: '50mb',
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use(apiLimiter);

// Health check routes (rate limiting skips these - see shouldSkipRateLimit).
//
// Mounted at BOTH paths on purpose. `/health` sits at the root of the origin,
// which a path-routed deployment (DROP forwards only `/api` to this service)
// hands to the static frontend instead - so the backend had no externally
// reachable health check at all, and nothing could tell a wedged API from a
// healthy one. `/api/health` routes with the rest of the API everywhere;
// `/health` stays for Docker/compose health checks and local use.
app.use('/health', createHealthRoutes(healthService));
app.use('/api/health', createHealthRoutes(healthService));

// API routes
app.use('/api/auth', createAuthRouter(pool));
app.use('/api/auth/2fa', createTwoFactorRouter(pool)); // Two-factor authentication
app.use('/api/documents', createDocumentRouter(pool));
app.use('/api/documents', createDocumentSigningRouter(pool)); // Signing operations on documents
app.use('/api/teams', createTeamsRouter(pool));
app.use('/api/teams/:teamId/branding', createBrandingRouter(pool, getStorageService())); // Team branding settings
app.use('/api/teams/:teamId/invitations', createTeamInvitationsRouter(pool)); // Team invitations
app.use('/api/invitations', createInvitationsRouter(pool)); // Public invitation endpoints
app.use('/api/branding', createPublicBrandingRouter(pool, getStorageService())); // Public branding endpoints
app.use('/api/api-keys', createApiKeysRouter(pool));
app.use('/api/templates', createTemplateRouter(pool));
app.use('/api/webhooks', createWebhookRouter(pool));
app.use('/api/webhooks', createEmailWebhookRouter(pool)); // Email delivery webhooks
app.use('/api/pdf', createPdfRouter(pool)); // PDF processing endpoints
app.use('/api/signing', createSigningRouter(pool)); // Public signing links
app.use('/api/admin/emails', createEmailLogRouter(pool)); // Email logs (admin)
app.use('/api/admin/dlq', createAdminDlqRouter(pool)); // Dead Letter Queue (admin)
app.use('/api/admin/stats', createAdminStatsRouter(pool)); // Query performance stats (admin)
app.use('/api/admin/settings', createAdminSettingsRouter(pool)); // Instance settings (admin)
app.use('/api/admin/users', createAdminUsersRouter(pool)); // Account audit + session revocation (admin)
app.use('/api/util', utilityRoutes); // Utility endpoints (some public, some require authenticate - see utilityRoutes.ts)

// API documentation placeholder
app.get('/api/docs', (_req: Request, res: Response) => {
  res.status(200).json({
    message: 'API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      documents: '/api/documents',
      teams: '/api/teams',
      branding: '/api/teams/:teamId/branding',
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

// Prove the storage root is usable now, not on someone's first upload.
void verifyStorageRoot();

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

// Priority 50: Queue system (graceful drain of in-flight jobs; must complete
// before the shared DB pool closes at priority 0)
shutdownManager.register({
  name: 'Queue System (pg-boss)',
  priority: 50,
  close: () => stopQueues(),
});

// Priority 25: Application services
shutdownManager.register({
  name: 'Token Blacklist Service',
  priority: 25,
  close: () => tokenBlacklistService.close(),
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

// Log query stats periodically (every 5 minutes in production)
const QUERY_STATS_INTERVAL = NODE_ENV === 'production' ? 5 * 60 * 1000 : 60 * 1000;
const queryStatsInterval = setInterval(() => {
  logQueryStatsSummary();
}, QUERY_STATS_INTERVAL);

// Register query stats timer for cleanup
shutdownManager.register({
  name: 'Query Stats Timer',
  priority: 90,
  close: async () => {
    clearInterval(queryStatsInterval);
  },
});

export default app;
