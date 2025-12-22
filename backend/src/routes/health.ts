import { Router, Request, Response } from 'express';
import { HealthService } from '@/services/healthService';
import { authenticate } from '@/middleware/auth';
import { requireAdmin } from '@/middleware/authorize';

/**
 * Create health check routes
 * @param healthService - The health service instance
 * @returns Express router with health check endpoints
 */
export const createHealthRoutes = (healthService: HealthService): Router => {
  const router = Router();

  /**
   * GET /health
   * Liveness probe - checks if server is running
   * Used by container orchestrators to determine if process is alive
   * Always returns 200 if Express is responding
   */
  router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/ready
   * Readiness probe - checks if app can handle requests
   * Verifies database and Redis connectivity
   * Returns 503 if any critical dependency is down
   */
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      const status = await healthService.getReadinessStatus();
      const httpStatus = status.status === 'ready' ? 200 : 503;
      res.status(httpStatus).json(status);
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'down',
          redis: 'down',
        },
        error: 'Failed to check health status',
      });
    }
  });

  /**
   * GET /health/detailed
   * Detailed diagnostics - comprehensive health information
   * Requires admin authentication
   * Includes latency measurements and all dependency status
   */
  router.get('/detailed', authenticate, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const status = await healthService.getFullStatus();
      const httpStatus = status.status === 'unhealthy' ? 503 : 200;
      res.status(httpStatus).json(status);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        checks: {
          database: { status: 'down', error: 'Failed to check' },
          redis: { status: 'down', error: 'Failed to check' },
          storage: { status: 'down', error: 'Failed to check' },
        },
        error: 'Failed to retrieve detailed health status',
      });
    }
  });

  return router;
};
