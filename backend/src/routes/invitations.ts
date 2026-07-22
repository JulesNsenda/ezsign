/**
 * Team Invitation Routes
 */
import { Router } from 'express';
import { Pool } from 'pg';
import { InvitationController } from '@/controllers/invitationController';
import { EmailService } from '@/services/emailService';
import { createEmailLogService } from '@/services/emailLogService';
import { getSettingsService } from '@/services/settingsService';
import { authenticate } from '@/middleware/auth';

/**
 * Create email service for invitation emails. Config (SMTP + app URL) is
 * resolved fresh from instance settings (DB -> env -> default) on every send
 * - see settingsService.getEmailConfig(). Every setting has a default, so
 * this is always usable (no more "undefined when SMTP isn't configured" -
 * an unreachable default SMTP host just fails the send, which callers
 * already handle).
 */
const createEmailService = (pool: Pool): EmailService => {
  const emailLogService = createEmailLogService(pool);
  return EmailService.withProvider(() => getSettingsService(pool).getEmailConfig(), emailLogService);
};

/**
 * Create router for team invitation routes (nested under /api/teams/:teamId/invitations)
 */
export const createTeamInvitationsRouter = (pool: Pool): Router => {
  const router = Router({ mergeParams: true }); // mergeParams to access :teamId from parent
  const emailService = createEmailService(pool);
  const invitationController = new InvitationController(pool, emailService);

  // All routes require authentication
  router.use(authenticate);

  // Get all invitations for a team
  router.get('/', invitationController.getTeamInvitations);

  // Create a new invitation
  router.post('/', invitationController.createInvitation);

  // Cancel/delete an invitation
  router.delete('/:invitationId', invitationController.cancelInvitation);

  // Resend an invitation
  router.post('/:invitationId/resend', invitationController.resendInvitation);

  return router;
};

/**
 * Create router for public invitation routes (at /api/invitations)
 */
export const createInvitationsRouter = (pool: Pool): Router => {
  const router = Router();
  const emailService = createEmailService(pool);
  const invitationController = new InvitationController(pool, emailService);

  // Get invitation details by token (public - for accept page)
  router.get('/:token', invitationController.getInvitationByToken);

  // Accept an invitation (requires auth)
  router.post('/:token/accept', authenticate, invitationController.acceptInvitation);

  // Get pending invitations for current user (requires auth)
  router.get('/', authenticate, invitationController.getPendingInvitations);

  return router;
};
