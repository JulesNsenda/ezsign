import { Router } from 'express';
import { Pool } from 'pg';
import { WebhookController } from '@/controllers/webhookController';
import { authenticate } from '@/middleware/auth';
import { createRateLimiter } from '@/middleware/rateLimiter';

export const createWebhookRouter = (pool: Pool): Router => {
  const router = Router();
  const webhookController = new WebhookController(pool);

  // Rate limiters
  const webhookCreationLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    message: 'Too many webhook creation attempts, please try again later',
  });

  // All webhook routes require authentication
  router.use(authenticate);

  // Create webhook (with rate limiting)
  router.post('/', webhookCreationLimiter, webhookController.createWebhook);

  // Get all webhooks
  router.get('/', webhookController.getWebhooks);

  // Get single webhook
  router.get('/:id', webhookController.getWebhook);

  // Update webhook
  router.put('/:id', webhookController.updateWebhook);

  // Delete webhook
  router.delete('/:id', webhookController.deleteWebhook);

  return router;
};
