/**
 * Admin Users Routes
 * Account-audit + session-revocation tooling for the registration-gate
 * plan (item 2.5). All routes require authentication + the admin role.
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '@/middleware/auth';
import { requireAdmin } from '@/middleware/authorize';
import { AdminUsersController } from '@/controllers/adminUsersController';

export const createAdminUsersRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new AdminUsersController(pool);

  // All routes require admin authentication
  router.use(authenticate);
  router.use(requireAdmin);

  /**
   * GET /api/admin/users/audit
   * Lists accounts (id, email, role, created_at), paginated.
   */
  router.get('/audit', controller.listAccountsForAudit);

  /**
   * POST /api/admin/users/:userId/revoke-sessions
   * Revokes all existing sessions for the given user (forces re-login);
   * does not disable the account or change its password.
   */
  router.post('/:userId/revoke-sessions', controller.revokeSessions);

  return router;
};

export default createAdminUsersRouter;
