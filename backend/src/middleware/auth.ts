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

    // If no token in header, try query parameter (for PDF loading etc.)
    if (!token && req.query.token) {
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

    // Check if token is blacklisted (by jti or user-wide revocation)
    // Only check if the token has a jti (backward compatibility with old tokens)
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
    next();
  } catch (error) {
    logger.debug('Token verification failed', { error: (error as Error).message, correlationId: req.correlationId });
    if (error instanceof Error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: error.message,
      });
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
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
