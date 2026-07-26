import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { UserService } from '@/services/userService';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import { uuidSchema } from '@/middleware/validation';
import { validatePaginationParams } from '@/utils/pagination';
import logger from '@/services/loggerService';

/**
 * Admin Users Controller
 *
 * Operator tooling for the registration-gate plan (item 2.5): closing
 * registration is prospective only - it never touches /login or /refresh,
 * so any account created during an open window keeps a rolling session
 * forever. This lets an admin find such accounts and force them to
 * re-authenticate.
 */
export class AdminUsersController {
  private pool: Pool;
  private userService: UserService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.userService = new UserService(pool);
  }

  /**
   * GET /api/admin/users/audit?page=1&pageSize=20
   * Lists accounts (id, email, role, created_at), paginated, so an operator
   * can spot anyone who registered while registration was open - including
   * an account later promoted to admin, which is why this is not filtered
   * to non-admin accounts.
   */
  listAccountsForAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedPage = parseInt(req.query.page as string, 10);
      const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

      // validatePaginationParams() only substitutes its default for a
      // literal `undefined` - parseInt() of a missing query param produces
      // NaN, not undefined, so that has to be normalized here first or an
      // omitted `pageSize` would resolve to NaN instead of the default.
      const requestedPageSize = parseInt(req.query.pageSize as string, 10);
      const pageSize = validatePaginationParams(
        Number.isFinite(requestedPageSize) ? requestedPageSize : undefined,
        100,
        20
      );

      const { accounts, total } = await this.userService.listAccountsForAudit({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      res.json({
        success: true,
        data: { users: accounts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/admin/users/:userId/revoke-sessions
   * Forces the target user to re-authenticate everywhere by revoking all
   * of their existing tokens via the same tokenBlacklistService path used
   * by change-password. Does not disable the account or change its
   * password - pair with deleting the account if it's unwanted outright.
   */
  revokeSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedId = uuidSchema.safeParse(req.params.userId);
    if (!parsedId.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId must be a valid UUID' },
      });
      return;
    }

    try {
      const user = await this.userService.findById(parsedId.data);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
        return;
      }

      const revoked = await tokenBlacklistService.blacklistAllUserTokens(user.id);
      if (!revoked) {
        // blacklistAllUserTokens() never throws (best-effort write) - it
        // returns false instead, so a transient DB error doesn't silently
        // report success while the target's refresh token keeps working.
        res.status(500).json({
          success: false,
          error: { code: 'REVOCATION_FAILED', message: 'Failed to revoke sessions - please retry' },
        });
        return;
      }

      logger.info('Admin revoked all sessions for a user', {
        targetUserId: user.id,
        adminUserId: req.user?.userId,
      });

      try {
        await this.pool.query(
          `INSERT INTO audit_events (document_id, user_id, event_type, ip_address, metadata)
           VALUES (NULL, $1, 'user.sessions_revoked', $2, $3)`,
          [
            req.user?.userId ?? null,
            req.ip || null,
            JSON.stringify({ targetUserId: user.id, targetEmail: user.email }),
          ]
        );
      } catch (auditError) {
        // Best-effort: the revocation itself already succeeded above -
        // don't fail the response just because the audit row didn't write.
        logger.warn('Failed to write session-revocation audit event', {
          error: (auditError as Error).message,
          targetUserId: user.id,
        });
      }

      res.json({
        success: true,
        data: { message: `All sessions revoked for ${user.email}` },
      });
    } catch (error) {
      next(error);
    }
  };
}
