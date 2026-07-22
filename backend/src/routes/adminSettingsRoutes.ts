/**
 * Admin Instance Settings Routes
 * Admin-only API for configuring operational settings (SMTP, from-address,
 * app URL) stored in Postgres, resolved DB -> env -> default.
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '@/middleware/auth';
import { requireAdmin } from '@/middleware/authorize';
import { AdminSettingsController } from '@/controllers/adminSettingsController';

/**
 * Create admin instance-settings routes.
 * All routes require authentication + the admin role.
 */
export const createAdminSettingsRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new AdminSettingsController(pool);

  // All routes require admin authentication
  router.use(authenticate);
  router.use(requireAdmin);

  /**
   * GET /api/admin/settings
   * Returns every known setting's effective value/source plus read-only
   * system info.
   */
  router.get('/', controller.getSettings);

  /**
   * PUT /api/admin/settings
   * Updates one or more settings; returns the fresh settings list.
   */
  router.put('/', controller.updateSettings);

  /**
   * POST /api/admin/settings/test-email
   * Sends a test email to the calling admin using the current effective
   * SMTP config.
   */
  router.post('/test-email', controller.testEmail);

  return router;
};

export default createAdminSettingsRouter;
