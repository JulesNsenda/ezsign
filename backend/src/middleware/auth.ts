import { Request, Response, NextFunction } from 'express';
import { tokenService } from '@/services/tokenService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import { UserRole } from '@/models/User';
import logger from '@/services/loggerService';

// Extend Express Request type to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

/**
 * Gate 2 fix 4: the only error messages safe to return to the client
 * verbatim from `authenticate`'s outer catch below. tokenService.ts's
 * verifyAccessToken() already normalizes jwt.TokenExpiredError /
 * jwt.JsonWebTokenError into plain `Error`s with exactly these two
 * messages (tokenService.ts:97-104) - that normalization is how this
 * codebase already distinguishes "expected JWT problem" from "anything
 * else" by the time the error reaches here. Anything not in this set
 * (e.g. TokenBlacklistService's "used before init(pool) was called", or
 * any other unexpected internal error) must NOT be echoed back to the
 * client - see the generic fallback message below.
 */
const EXPECTED_TOKEN_ERROR_MESSAGES = new Set<string>([
  'Access token has expired',
  'Invalid access token',
]);

/**
 * Middleware to authenticate JWT tokens
 * Extracts token from Authorization header or query parameter and validates it
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    logger.debug('Authentication attempt', { path: req.path, hasAuthHeader: !!authHeader, correlationId: req.correlationId });
    let token = tokenService.extractTokenFromHeader(authHeader);

    // If no token in header, try query parameter (for PDF loading etc.).
    //
    // Privileged routes never accept a query-string token - header only.
    // URLs reach reverse-proxy logs, browser history and `Referer` headers,
    // so a token in one escapes the protection the request body has.
    //
    // That is not just `/api/admin`: `/documents/:id/activity` carries an
    // instance-admin bypass (`allowAdmin`), which makes it the first route
    // outside `/api/admin` where an admin token in a URL yields *another
    // tenant's* data - signer emails, recipient addresses, subjects carrying
    // document titles, and raw SMTP errors. Any future route that grants a
    // cross-tenant read has to be added here too.
    const fullPath = (req.baseUrl + req.path).toLowerCase();
    const isPrivilegedPath = fullPath.startsWith('/api/admin') || fullPath.endsWith('/activity');
    if (!token && req.query.token && !isPrivilegedPath) {
      token = req.query.token as string;
    }

    if (!token) {
      logger.debug('No token found', { path: req.path, correlationId: req.correlationId });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
      return;
    }

    // Verify and decode the token
    const decoded = tokenService.verifyAccessToken(token);

    // Check if token is blacklisted (by jti or user-wide revocation).
    // Only check if the token has a jti (backward compatibility with old tokens).
    //
    // Fail-closed: tokenBlacklistService's read methods (isBlacklisted,
    // isUserSessionRevoked) return true on a query error rather than
    // throwing, so a Postgres blip surfaces here as isRevoked/isSessionRevoked
    // === true -> 401 below. If the service was never initialized, the call
    // throws instead, which is caught by this function's outer try/catch and
    // also yields 401 (not 500/503) -- consistent handling for both failure
    // shapes, since in both cases we cannot prove the token is still valid.
    if (decoded.jti) {
      const isRevoked = await tokenBlacklistService.isBlacklisted(decoded.jti);
      if (isRevoked) {
        logger.debug('Token has been revoked', { jti: decoded.jti, correlationId: req.correlationId });
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has been revoked',
        });
        return;
      }

      // Check if all user tokens were revoked after this token was issued
      const isSessionRevoked = await tokenBlacklistService.isUserSessionRevoked(
        decoded.userId,
        decoded.iat
      );
      if (isSessionRevoked) {
        logger.debug('User session has been revoked', { userId: decoded.userId, correlationId: req.correlationId });
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Session has been revoked. Please log in again.',
        });
        return;
      }
    }

    // Attach user data to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    logger.debug('User authenticated', { email: req.user.email, role: req.user.role, correlationId: req.correlationId });

    // Enforce forced password change: while the claim is set, only the
    // change-password and me endpoints remain reachable.
    if (decoded.mustChangePassword === true) {
      const fullPath = (req.baseUrl + req.path).replace(/\/+$/, '');
      if (fullPath !== '/api/auth/change-password' && fullPath !== '/api/auth/me') {
        logger.debug('Blocked request pending forced password change', { path: fullPath, correlationId: req.correlationId });
        res.status(403).json({
          error: 'Forbidden',
          message: 'Password change required before accessing this resource',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
        return;
      }
    }

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;

    // Gate 2 fix 4: only the two expected JWT-verification messages are
    // safe to return verbatim (see EXPECTED_TOKEN_ERROR_MESSAGES above).
    // Anything else - e.g. a TokenBlacklistService wiring bug, or any other
    // unexpected throw reaching this outer catch - must not leak its
    // internal details to the client; log it server-side and respond with a
    // generic message instead.
    if (message && EXPECTED_TOKEN_ERROR_MESSAGES.has(message)) {
      logger.debug('Token verification failed', { error: message, correlationId: req.correlationId });
      res.status(401).json({
        error: 'Unauthorized',
        message,
      });
    } else {
      logger.error('Authentication failed with an unexpected error', {
        error: message ?? 'unknown error',
        correlationId: req.correlationId,
      });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed',
      });
    }
  }
};

/**
 * Optional authentication middleware
 * Attaches user data if token is valid, but doesn't fail if no token
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = tokenService.extractTokenFromHeader(authHeader);

    if (token) {
      try {
        const decoded = tokenService.verifyAccessToken(token);
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };
      } catch (error) {
        // Token invalid, but that's okay for optional auth
        // Just continue without user data
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Type guard to check if request is authenticated
 */
export const isAuthenticated = (req: Request): req is AuthenticatedRequest => {
  return req.user !== undefined;
};
