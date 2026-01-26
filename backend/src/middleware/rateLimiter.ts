import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisConnection } from '@/config/queue';
import logger from '@/services/loggerService';
import { Request } from 'express';
import Redis from 'ioredis';

/**
 * Rate limit tiers based on authentication type
 */
export const RATE_LIMIT_TIERS = {
  anonymous: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 minutes
  authenticated: { windowMs: 15 * 60 * 1000, max: 500 }, // 500 requests per 15 minutes
  apiKey: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1000 requests per 15 minutes
};

/**
 * Lazy-initialized Redis connection for rate limiting
 */
let rateLimitRedis: Redis | null = null;
let redisStore: RedisStore | null = null;
let redisAvailable = true;

/**
 * Get or create Redis store for rate limiting
 * Falls back to in-memory store if Redis is unavailable
 */
const getRedisStore = (): RedisStore | undefined => {
  if (!redisAvailable) {
    return undefined;
  }

  if (redisStore) {
    return redisStore;
  }

  try {
    rateLimitRedis = getRedisConnection();

    // Test connection synchronously isn't possible, so we set up error handling
    rateLimitRedis.on('error', (err) => {
      logger.warn('Redis rate limit store error, falling back to in-memory', {
        error: err.message,
      });
      redisAvailable = false;
      redisStore = null;
    });

    rateLimitRedis.on('connect', () => {
      logger.info('Redis rate limit store connected');
      redisAvailable = true;
    });

    redisStore = new RedisStore({
      // Use sendCommand for ioredis compatibility
      // @ts-expect-error - ioredis call method is compatible but types differ slightly
      sendCommand: (...args: string[]) => rateLimitRedis!.call(...args),
      prefix: 'ratelimit:',
    });

    return redisStore;
  } catch (error) {
    logger.warn('Failed to create Redis rate limit store, using in-memory', {
      error: (error as Error).message,
    });
    redisAvailable = false;
    return undefined;
  }
};

/**
 * Get the rate limit key based on request authentication
 */
const getKeyGenerator = (req: Request): string => {
  // Check for API key authentication
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    // Use a hash of the API key to avoid storing the key directly
    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
    return `apikey:${keyHash}`;
  }

  // Check for JWT authentication
  const user = (req as any).user;
  if (user?.userId) {
    return `user:${user.userId}`;
  }

  // Fall back to IP address for anonymous requests
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `anon:${ip}`;
};

/**
 * Get the max requests based on authentication type
 */
const getMaxRequests = (req: Request): number => {
  // Check for API key authentication
  if (req.headers['x-api-key']) {
    return RATE_LIMIT_TIERS.apiKey.max;
  }

  // Check for JWT authentication
  const user = (req as any).user;
  if (user?.userId) {
    return RATE_LIMIT_TIERS.authenticated.max;
  }

  // Anonymous users get the lowest limit
  return RATE_LIMIT_TIERS.anonymous.max;
};

/**
 * Create a tiered rate limiter that uses Redis store and adjusts limits based on auth type
 */
export const createTieredRateLimiter = (): RateLimitRequestHandler => {
  const store = getRedisStore();

  if (!store) {
    logger.warn('Rate limiting using in-memory store (not distributed)');
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: getMaxRequests,
    keyGenerator: getKeyGenerator,
    store: store,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path.startsWith('/health/');
    },
    handler: (req, res, _next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        key: getKeyGenerator(req),
        correlationId: (req as any).correlationId,
      });
      res.status(options.statusCode).json(options.message);
    },
  });
};

/**
 * General API rate limiter (legacy - for backward compatibility)
 * Uses tiered limits based on authentication
 */
export const apiLimiter = createTieredRateLimiter();

/**
 * Stricter rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too Many Requests',
    message: 'Too many login attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: getRedisStore(),
  keyGenerator: (req) => `auth:${req.ip || req.socket.remoteAddress || 'unknown'}`,
});

/**
 * Rate limiter for document upload
 * 10 uploads per hour per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too Many Requests',
    message: 'Too many uploads, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  keyGenerator: (req) => {
    const user = (req as any).user;
    if (user?.userId) {
      return `upload:user:${user.userId}`;
    }
    return `upload:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
});

/**
 * Rate limiter for signing operations
 * 20 signatures per hour per IP
 */
export const signingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    error: 'Too Many Requests',
    message: 'Too many signing requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  keyGenerator: (req) => `signing:${req.ip || req.socket.remoteAddress || 'unknown'}`,
});

/**
 * Rate limiter for password change operations
 * 5 attempts per hour per IP
 */
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'Too Many Requests',
    message: 'Too many password change attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  keyGenerator: (req) => {
    const user = (req as any).user;
    if (user?.userId) {
      return `pwchange:user:${user.userId}`;
    }
    return `pwchange:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
});

/**
 * Rate limiter for 2FA verification attempts
 * 5 attempts per 5 minutes per IP
 */
export const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: {
    error: 'Too Many Requests',
    message: 'Too many verification attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: getRedisStore(),
  keyGenerator: (req) => `2fa:${req.ip || req.socket.remoteAddress || 'unknown'}`,
});

/**
 * Create a custom rate limiter with specific options
 */
export const createRateLimiter = (options: Partial<Options>) => {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    store: getRedisStore(),
    ...options,
  });
};

/**
 * Close the rate limit Redis connection (for graceful shutdown)
 */
export const closeRateLimitRedis = async (): Promise<void> => {
  if (rateLimitRedis) {
    await rateLimitRedis.quit();
    rateLimitRedis = null;
    redisStore = null;
    logger.info('Rate limit Redis connection closed');
  }
};
