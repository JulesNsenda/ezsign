/**
 * Admin Stats Routes
 * Provides endpoints for system statistics and performance monitoring
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '@/middleware/auth';
import { requireRole } from '@/middleware/authorize';
import { getQueryStats, getPoolStats, resetQueryStats } from '@/services/databaseService';
import logger from '@/services/loggerService';

/**
 * Create admin stats routes
 * All routes require admin authentication
 */
export const createAdminStatsRouter = (pool: Pool): Router => {
  const router = Router();

  // All routes require admin authentication
  router.use(authenticate);
  router.use(requireRole('admin'));

  /**
   * GET /api/admin/stats/queries
   * Get query performance statistics
   */
  router.get('/queries', (_req: Request, res: Response) => {
    try {
      const stats = getQueryStats();
      const poolStats = getPoolStats(pool);

      res.json({
        success: true,
        data: {
          queries: stats,
          pool: poolStats,
        },
      });
    } catch (error) {
      logger.error('Failed to get query stats', {
        error: (error as Error).message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get query statistics',
      });
    }
  });

  /**
   * POST /api/admin/stats/queries/reset
   * Reset query statistics (useful for measuring specific operations)
   */
  router.post('/queries/reset', (req: Request, res: Response) => {
    try {
      resetQueryStats();

      logger.info('Query stats reset by admin', {
        userEmail: req.user?.email,
      });

      res.json({
        success: true,
        message: 'Query statistics reset successfully',
      });
    } catch (error) {
      logger.error('Failed to reset query stats', {
        error: (error as Error).message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to reset query statistics',
      });
    }
  });

  /**
   * GET /api/admin/stats/pool
   * Get database connection pool statistics
   */
  router.get('/pool', (_req: Request, res: Response) => {
    try {
      const poolStats = getPoolStats(pool);

      res.json({
        success: true,
        data: poolStats,
      });
    } catch (error) {
      logger.error('Failed to get pool stats', {
        error: (error as Error).message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get pool statistics',
      });
    }
  });

  return router;
};
