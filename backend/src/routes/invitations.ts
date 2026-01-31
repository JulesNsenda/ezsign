/**
 * Team Invitation Routes
 */
import { Router } from 'express';
import { Pool } from 'pg';
import { InvitationController } from '@/controllers/invitationController';
import { EmailService, EmailConfig } from '@/services/emailService';
import { authenticate } from '@/middleware/auth';

/**
 * Create email service for invitation emails
 */
const createEmailService = (): EmailService | undefined => {
  const smtpHost = process.env.EMAIL_SMTP_HOST;
  const smtpPort = process.env.EMAIL_SMTP_PORT;
  const smtpUser = process.env.EMAIL_SMTP_USER;
  const smtpPass = process.env.EMAIL_SMTP_PASS;
  const smtpFrom = process.env.EMAIL_SMTP_FROM;
  const baseUrl = process.env.APP_URL || 'http://localhost:3002';

  // Only create email service if SMTP is configured
  if (!smtpHost || !smtpPort || !smtpFrom) {
    return undefined;
  }

  const emailConfig: EmailConfig = {
    host: smtpHost,
    port: parseInt(smtpPort, 10),
    secure: parseInt(smtpPort, 10) === 465,
    from: smtpFrom,
  };

  // Add auth if credentials are provided
  if (smtpUser && smtpPass) {
    emailConfig.auth = {
      user: smtpUser,
      pass: smtpPass,
    };
  }

  return new EmailService(emailConfig, baseUrl);
};

/**
 * Create router for team invitation routes (nested under /api/teams/:teamId/invitations)
 */
export const createTeamInvitationsRouter = (pool: Pool): Router => {
  const router = Router({ mergeParams: true }); // mergeParams to access :teamId from parent
  const emailService = createEmailService();
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
  const emailService = createEmailService();
  const invitationController = new InvitationController(pool, emailService);

  // Get invitation details by token (public - for accept page)
  router.get('/:token', invitationController.getInvitationByToken);

  // Accept an invitation (requires auth)
  router.post('/:token/accept', authenticate, invitationController.acceptInvitation);

  // Get pending invitations for current user (requires auth)
  router.get('/', authenticate, invitationController.getPendingInvitations);

  return router;
};
