/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@/models/User';

/**
 * Middleware to check if user has required role
 * Must be used after authenticate middleware
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is an admin
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user is a creator or admin
 */
export const requireCreator = requireRole('admin', 'creator');

/**
 * Middleware to check if user is authenticated (any role)
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  next();
};

/**
 * Middleware to check if user owns a resource
 * Requires req.params to have a userId field
 */
export const requireOwnership = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  const resourceUserId = req.params.userId || req.body.userId;

  if (!resourceUserId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'User ID not found in request',
    });
    return;
  }

  // Admin can access any resource
  if (req.user.role === 'admin') {
    next();
    return;
  }

  // Check if user owns the resource
  if (req.user.userId !== resourceUserId) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    });
    return;
  }

  next();
};

/**
 * Middleware to check if user owns a resource or is an admin
 * More flexible version that works with custom fields
 */
export const requireOwnershipOrAdmin = (userIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Admin can access any resource
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Get the resource owner's ID from params, body, or query
    const resourceUserId =
      req.params[userIdField] || req.body[userIdField] || req.query[userIdField];

    if (!resourceUserId) {
      res.status(400).json({
        error: 'Bad Request',
        message: `${userIdField} not found in request`,
      });
      return;
    }

    // Check if user owns the resource
    if (req.user.userId !== resourceUserId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check team membership
 * Requires a database query - this is a factory function
 */
export const createRequireTeamMember = (
  checkTeamMembership: (userId: string, teamId: string) => Promise<boolean>,
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Admin can access any team
    if (req.user.role === 'admin') {
      next();
      return;
    }

    const teamId = req.params.teamId || req.body.teamId || req.query.teamId;

    if (!teamId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Team ID not found in request',
      });
      return;
    }

    try {
      const isMember = await checkTeamMembership(req.user.userId, teamId as string);

      if (!isMember) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You are not a member of this team',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify team membership',
      });
    }
  };
};

/**
 * Middleware to check team admin/owner role
 * Requires a database query - this is a factory function
 */
export const createRequireTeamAdmin = (
  checkTeamAdmin: (userId: string, teamId: string) => Promise<boolean>,
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // System admin can access any team
    if (req.user.role === 'admin') {
      next();
      return;
    }

    const teamId = req.params.teamId || req.body.teamId || req.query.teamId;

    if (!teamId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Team ID not found in request',
      });
      return;
    }

    try {
      const isAdmin = await checkTeamAdmin(req.user.userId, teamId as string);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have admin permissions for this team',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify team admin status',
      });
    }
  };
};
