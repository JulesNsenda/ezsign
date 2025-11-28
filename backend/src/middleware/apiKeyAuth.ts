import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ApiKeyService } from '@/services/apiKeyService';
import { UserService } from '@/services/userService';
import { UserRole } from '@/models/User';
import logger from '@/services/loggerService';

// Extend Express Request type to include API key authentication data
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        userId: string;
        name: string;
      };
    }
  }
}

export interface ApiKeyAuthenticatedRequest extends Request {
  apiKey: {
    id: string;
    userId: string;
    name: string;
  };
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

/**
 * Create API key authentication middleware
 */
export const createApiKeyAuth = (pool: Pool) => {
  const apiKeyService = new ApiKeyService(pool);
  const userService = new UserService(pool);

  /**
   * Middleware to authenticate API keys
   * Extracts key from X-API-Key header and validates it
   */
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

      if (!apiKeyHeader) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No API key provided',
        });
        return;
      }

      // Validate the API key
      const apiKey = await apiKeyService.validateKey(apiKeyHeader);

      if (!apiKey) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired API key',
        });
        return;
      }

      // Fetch actual user data from database
      const user = await userService.findById(apiKey.user_id);

      if (!user) {
        // User was deleted but API key still exists
        logger.warn('API key used for deleted user', {
          apiKeyId: apiKey.id,
          userId: apiKey.user_id,
          correlationId: req.correlationId,
        });
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User account no longer exists',
        });
        return;
      }

      // Attach API key data to request
      req.apiKey = {
        id: apiKey.id,
        userId: apiKey.user_id,
        name: apiKey.name,
      };

      // Attach actual user data for authorization checks
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      logger.debug('API key authenticated', {
        apiKeyId: apiKey.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        correlationId: req.correlationId,
      });

      next();
    } catch (error) {
      logger.error('API key authentication error', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }
  };
};

/**
 * Middleware to authenticate using either JWT or API key
 * Checks for JWT first, then falls back to API key
 */
export const createDualAuth = (pool: Pool) => {
  const apiKeyService = new ApiKeyService(pool);
  const userService = new UserService(pool);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Check for JWT token first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // JWT authentication will be handled by the authenticate middleware
      // Just continue to next middleware
      next();
      return;
    }

    // Fall back to API key authentication
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    if (!apiKeyHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication credentials provided',
      });
      return;
    }

    try {
      const apiKey = await apiKeyService.validateKey(apiKeyHeader);

      if (!apiKey) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired API key',
        });
        return;
      }

      // Fetch actual user data from database
      const user = await userService.findById(apiKey.user_id);

      if (!user) {
        // User was deleted but API key still exists
        logger.warn('API key used for deleted user (dual auth)', {
          apiKeyId: apiKey.id,
          userId: apiKey.user_id,
          correlationId: req.correlationId,
        });
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User account no longer exists',
        });
        return;
      }

      req.apiKey = {
        id: apiKey.id,
        userId: apiKey.user_id,
        name: apiKey.name,
      };

      // Attach actual user data for authorization checks
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      logger.debug('API key authenticated (dual auth)', {
        apiKeyId: apiKey.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        correlationId: req.correlationId,
      });

      next();
    } catch (error) {
      logger.error('Dual auth error', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication credentials',
      });
    }
  };
};

/**
 * Type guard to check if request is API key authenticated
 */
export const isApiKeyAuthenticated = (
  req: Request
): req is ApiKeyAuthenticatedRequest => {
  return req.apiKey !== undefined;
};
