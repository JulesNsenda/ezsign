import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import logger from '@/services/loggerService';
import { Request, Response, NextFunction } from 'express';

/**
 * Rate Limiting Configuration
 *
 * Environment Variables:
 * - RATE_LIMIT_ENABLED: Set to 'false' to disable rate limiting entirely (default: true)
 * - RATE_LIMIT_WINDOW_MS: Window size in milliseconds (default: 900000 = 15 minutes)
 * - RATE_LIMIT_MAX_ANONYMOUS: Max requests for anonymous users (default: 100)
 * - RATE_LIMIT_MAX_AUTHENTICATED: Max requests for authenticated users (default: 500)
 * - RATE_LIMIT_MAX_API_KEY: Max requests for API key users (default: 1000)
 * - RATE_LIMIT_AUTH_MAX: Max login attempts per window (default: 20)
 * - RATE_LIMIT_AUTH_WINDOW_MS: Auth window in ms (default: 900000 = 15 minutes)
 */

/**
 * Check if rate limiting is enabled
 */
const isRateLimitEnabled = (): boolean => {
  const enabled = process.env.RATE_LIMIT_ENABLED;
  // Disabled only if explicitly set to 'false'
  return enabled !== 'false';
};

/**
 * Get rate limit configuration from environment with defaults
 */
const getConfig = () => {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
  return {
    windowMs,
    anonymous: parseInt(process.env.RATE_LIMIT_MAX_ANONYMOUS || '100', 10),
    authenticated: parseInt(process.env.RATE_LIMIT_MAX_AUTHENTICATED || '500', 10),
    apiKey: parseInt(process.env.RATE_LIMIT_MAX_API_KEY || '1000', 10),
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20', 10),
    authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000', 10),
    uploadMax: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '50', 10),
    uploadWindowMs: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || '3600000', 10), // 1 hour
  };
};

/**
 * Rate limit tiers based on authentication type
 */
export const RATE_LIMIT_TIERS = {
  anonymous: { windowMs: getConfig().windowMs, max: getConfig().anonymous },
  authenticated: { windowMs: getConfig().windowMs, max: getConfig().authenticated },
  apiKey: { windowMs: getConfig().windowMs, max: getConfig().apiKey },
};

/**
 * Get the rate limit key based on request authentication
 *
 * IMPORTANT: The raw `x-api-key` header is attacker-controlled and unverified
 * at this point in the middleware chain - never key on it directly. Only an
 * *authenticated* API key identity (`req.apiKey`, attached by the real
 * `apiKeyAuth` middleware after validating the key against the database)
 * qualifies for the elevated tier. Today `apiLimiter` runs before any
 * authentication middleware, so `req.apiKey` is never set and every request
 * falls through to the user/IP branches below - that's expected, and keeps
 * this correct if the limiter is later moved after auth.
 */
export const getKeyGenerator = (req: Request): string => {
  // Check for an authenticated API key identity
  if (req.apiKey?.id) {
    return `apikey:${req.apiKey.id}`;
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
 *
 * See `getKeyGenerator` above - the elevated `apiKey` tier requires a
 * verified `req.apiKey` identity, never the raw unauthenticated header.
 */
export const getMaxRequests = (req: Request): number => {
  const config = getConfig();

  // Check for an authenticated API key identity
  if (req.apiKey?.id) {
    return config.apiKey;
  }

  // Check for JWT authentication
  const user = (req as any).user;
  if (user?.userId) {
    return config.authenticated;
  }

  // Anonymous users get the lowest limit
  return config.anonymous;
};

/**
 * Check if request should skip rate limiting
 */
const shouldSkipRateLimit = (req: Request): boolean => {
  // Skip if rate limiting is disabled
  if (!isRateLimitEnabled()) {
    return true;
  }

  // Skip OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return true;
  }

  // Skip rate limiting for health checks
  if (req.path === '/health' || req.path.startsWith('/health/')) {
    return true;
  }

  // Skip rate limiting for public signing routes (signers access via token)
  // The token itself provides access control
  if (req.path.startsWith('/api/signing/')) {
    return true;
  }

  return false;
};

/**
 * Create a tiered rate limiter (in-memory store) that adjusts limits based on auth type
 */
export const createTieredRateLimiter = (): RateLimitRequestHandler => {
  // If rate limiting is disabled, return a pass-through middleware
  if (!isRateLimitEnabled()) {
    logger.info('Rate limiting is DISABLED (RATE_LIMIT_ENABLED=false)');
    return ((_req: Request, _res: Response, next: NextFunction) => next()) as unknown as RateLimitRequestHandler;
  }

  const config = getConfig();

  logger.info('Rate limiting enabled', {
    windowMs: config.windowMs,
    anonymous: config.anonymous,
    authenticated: config.authenticated,
    apiKey: config.apiKey,
  });

  return rateLimit({
    windowMs: config.windowMs,
    max: getMaxRequests,
    keyGenerator: getKeyGenerator,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
    handler: (req, res, _next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
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
 * Configurable via RATE_LIMIT_AUTH_MAX and RATE_LIMIT_AUTH_WINDOW_MS
 */
export const authLimiter = (() => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const config = getConfig();

  return rateLimit({
    windowMs: config.authWindowMs,
    max: config.authMax,
    message: {
      error: 'Too Many Requests',
      message: 'Too many login attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: (req) => req.method === 'OPTIONS', // Skip CORS preflight
    keyGenerator: (req) => `auth:${req.ip || req.socket.remoteAddress || 'unknown'}`,
  });
})();

/**
 * Rate limiter for document upload
 * Configurable via RATE_LIMIT_UPLOAD_MAX and RATE_LIMIT_UPLOAD_WINDOW_MS
 */
export const uploadLimiter = (() => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const config = getConfig();

  return rateLimit({
    windowMs: config.uploadWindowMs,
    max: config.uploadMax,
    message: {
      error: 'Too Many Requests',
      message: 'Too many uploads, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => {
      const user = (req as any).user;
      if (user?.userId) {
        return `upload:user:${user.userId}`;
      }
      return `upload:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
  });
})();

/**
 * Rate limiter for signing operations
 * 50 signatures per hour per IP (generous for legitimate use)
 */
export const signingLimiter = (() => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_SIGNING_MAX || '50', 10),
    message: {
      error: 'Too Many Requests',
      message: 'Too many signing requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => `signing:${req.ip || req.socket.remoteAddress || 'unknown'}`,
  });
})();

/**
 * Rate limiter for password change operations
 * 10 attempts per hour per IP
 */
export const passwordChangeLimiter = (() => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_PASSWORD_MAX || '10', 10),
    message: {
      error: 'Too Many Requests',
      message: 'Too many password change attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => {
      const user = (req as any).user;
      if (user?.userId) {
        return `pwchange:user:${user.userId}`;
      }
      return `pwchange:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
  });
})();

/**
 * Rate limiter for 2FA verification attempts
 * 10 attempts per 5 minutes per IP
 */
export const twoFactorLimiter = (() => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: parseInt(process.env.RATE_LIMIT_2FA_MAX || '10', 10),
    message: {
      error: 'Too Many Requests',
      message: 'Too many verification attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => `2fa:${req.ip || req.socket.remoteAddress || 'unknown'}`,
  });
})();

/**
 * Create a custom rate limiter with specific options
 */
export const createRateLimiter = (options: Partial<Options>) => {
  if (!isRateLimitEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    ...options,
  });
};
