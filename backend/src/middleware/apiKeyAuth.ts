/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars */
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ApiKeyService } from '@/services/apiKeyService';
import { UserRole } from '@/models/User';

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

  /**
   * Middleware to authenticate API keys
   * Extracts key from X-API-Key header and validates it
   */
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      // Attach API key data to request
      req.apiKey = {
        id: apiKey.id,
        userId: apiKey.user_id,
        name: apiKey.name,
      };

      // Also fetch and attach user data for authorization checks
      // In a real implementation, you'd fetch this from the database
      // For now, we just set the userId
      req.user = {
        userId: apiKey.user_id,
        email: '', // Would be fetched from database
        role: 'creator' as UserRole, // Would be fetched from database
      };

      next();
    } catch (error) {
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

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      req.apiKey = {
        id: apiKey.id,
        userId: apiKey.user_id,
        name: apiKey.name,
      };

      req.user = {
        userId: apiKey.user_id,
        email: '',
        role: 'creator' as UserRole,
      };

      next();
    } catch (error) {
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
export const isApiKeyAuthenticated = (req: Request): req is ApiKeyAuthenticatedRequest => {
  return req.apiKey !== undefined;
};
