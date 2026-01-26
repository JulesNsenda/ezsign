import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';

/**
 * Get allowed origins for embedding from environment
 */
const getAllowedOrigins = (): string[] => {
  const origins = process.env.EMBED_ALLOWED_ORIGINS || '';
  if (!origins) return [];
  return origins.split(',').map((o) => o.trim()).filter(Boolean);
};

/**
 * Middleware to handle security headers for embedded signing
 *
 * When a request includes `embedded=true` query parameter:
 * - Validates the `origin` parameter against EMBED_ALLOWED_ORIGINS
 * - Sets appropriate CSP frame-ancestors header
 * - Sets X-Frame-Options header for legacy browser support
 *
 * When not embedded:
 * - Sets X-Frame-Options to SAMEORIGIN (prevent framing)
 */
export const embedSecurity = (req: Request, res: Response, next: NextFunction): void => {
  const embedded = req.query.embedded;
  const origin = req.query.origin as string | undefined;

  if (embedded === 'true') {
    const allowedOrigins = getAllowedOrigins();

    // If no origins configured, deny embedding
    if (allowedOrigins.length === 0) {
      logger.warn('Embed request denied: no allowed origins configured', {
        requestedOrigin: origin,
        path: req.path,
        correlationId: (req as any).correlationId,
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Embedding is not enabled. Configure EMBED_ALLOWED_ORIGINS to allow embedding.',
      });
      return;
    }

    // Check if wildcard is allowed
    const allowAll = allowedOrigins.includes('*');

    // Validate origin against allowlist
    if (!allowAll && origin && !allowedOrigins.includes(origin)) {
      logger.warn('Embed request denied: origin not in allowlist', {
        requestedOrigin: origin,
        allowedOrigins,
        path: req.path,
        correlationId: (req as any).correlationId,
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Origin not allowed for embedding.',
      });
      return;
    }

    // Set CSP frame-ancestors header
    if (allowAll) {
      // Allow all origins
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
    } else if (origin) {
      // Allow specific origin
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${origin}`);
    } else {
      // No origin specified but embedding allowed - allow from allowlist
      const frameAncestors = ["'self'", ...allowedOrigins].join(' ');
      res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
    }

    // X-Frame-Options is deprecated but still used by some browsers
    // Note: X-Frame-Options doesn't support multiple origins, so we skip it when
    // allowing multiple origins and rely on CSP instead
    if (origin && !allowAll) {
      // Modern browsers ignore X-Frame-Options when CSP frame-ancestors is present
      // but we set it for legacy support
      res.removeHeader('X-Frame-Options');
    }

    logger.debug('Embed request allowed', {
      origin: origin || 'not specified',
      allowAll,
      path: req.path,
      correlationId: (req as any).correlationId,
    });
  } else {
    // Default: prevent framing (SAMEORIGIN)
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  }

  next();
};

/**
 * Middleware to add CORS headers for embedded mode
 * This allows the parent page to communicate via PostMessage
 */
export const embedCors = (req: Request, res: Response, next: NextFunction): void => {
  const embedded = req.query.embedded;
  const origin = req.query.origin as string | undefined;

  if (embedded === 'true' && origin) {
    const allowedOrigins = getAllowedOrigins();
    const allowAll = allowedOrigins.includes('*');

    if (allowAll || allowedOrigins.includes(origin)) {
      // Allow the parent origin to make requests
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  next();
};

export default embedSecurity;
