/**
 * Email Log Routes
 *
 * Routes for email delivery tracking and management
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { EmailLogController } from '@/controllers/emailLogController';
import { authenticate } from '@/middleware/auth';
import { requireAdmin } from '@/middleware/authorize';

export const createEmailLogRouter = (pool: Pool): Router => {
  const router = Router();
  const emailLogController = new EmailLogController(pool);

  // All routes require authentication
  router.use(authenticate);

  // Admin routes - require admin role
  router.get('/', requireAdmin, emailLogController.getAllEmails);
  router.get('/:id', requireAdmin, emailLogController.getEmailById);
  router.post('/:id/resend', requireAdmin, emailLogController.resendEmail);

  return router;
};

/**
 * Create router for email delivery webhooks
 * These do NOT require session authentication (external service callbacks) -
 * instead the handler itself verifies an HMAC-SHA256 signature against
 * WEBHOOK_SECRET before trusting the payload.
 */
export const createEmailWebhookRouter = (pool: Pool): Router => {
  const router = Router();
  const emailLogController = new EmailLogController(pool);

  // Webhook endpoint for email status updates
  router.post('/email-status', emailLogController.handleDeliveryWebhook);

  return router;
};

export default createEmailLogRouter;
