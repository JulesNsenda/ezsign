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
 * Create router for document-specific email routes
 * These will be mounted under /api/documents/:id/emails
 */
export const createDocumentEmailRouter = (pool: Pool): Router => {
  const router = Router({ mergeParams: true });
  const emailLogController = new EmailLogController(pool);

  // Require authentication
  router.use(authenticate);

  // Document email routes - user must have access to the document
  // (access control is handled by documentAccess middleware in parent router)
  router.get('/', emailLogController.getDocumentEmails);
  router.get('/stats', emailLogController.getDocumentEmailStats);

  return router;
};

/**
 * Create router for signer-specific email routes
 * These will be mounted under /api/signers/:id/emails
 */
export const createSignerEmailRouter = (pool: Pool): Router => {
  const router = Router({ mergeParams: true });
  const emailLogController = new EmailLogController(pool);

  // Require authentication
  router.use(authenticate);

  // Signer email routes
  router.get('/', emailLogController.getSignerEmails);

  return router;
};

/**
 * Create router for email delivery webhooks
 * These do NOT require authentication (external service callbacks)
 */
export const createEmailWebhookRouter = (pool: Pool): Router => {
  const router = Router();
  const emailLogController = new EmailLogController(pool);

  // Webhook endpoint for email status updates
  // No authentication - but should validate webhook signature in production
  router.post('/email-status', emailLogController.handleDeliveryWebhook);

  return router;
};

export default createEmailLogRouter;
