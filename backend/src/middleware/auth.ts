import { Request, Response, NextFunction } from 'express';
import { tokenService } from '@/services/tokenService';
import { UserRole } from '@/models/User';

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
    console.log('Auth header:', authHeader); // Debug log
    let token = tokenService.extractTokenFromHeader(authHeader);

    // If no token in header, try query parameter (for PDF loading etc.)
    if (!token && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      console.log('No token found for:', req.path); // Debug log
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
      return;
    }

    // Verify and decode the token
    const decoded = tokenService.verifyAccessToken(token);

    // Attach user data to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    console.log('User authenticated:', req.user.email, req.user.role); // Debug log
    next();
  } catch (error) {
    console.log('Token verification failed:', error); // Debug log
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
  res: Response,
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
