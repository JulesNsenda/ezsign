import { Router } from 'express';
import { Pool } from 'pg';
import { DeadLetterQueueController } from '@/controllers/deadLetterQueueController';
import { authenticate } from '@/middleware/auth';
import { requireRole } from '@/middleware/authorize';

/**
 * Create Dead Letter Queue admin routes
 * All routes require admin authentication
 */
export const createAdminDlqRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new DeadLetterQueueController(pool);

  // All routes require admin authentication
  router.use(authenticate);
  router.use(requireRole('admin'));

  // Get DLQ statistics
  router.get('/stats', controller.getStats);

  // Get available queue names for filtering
  router.get('/queues', controller.getQueueNames);

  // List DLQ entries with filtering
  router.get('/', controller.list);

  // Get a single DLQ entry
  router.get('/:id', controller.getById);

  // Retry a single job
  router.post('/:id/retry', controller.retryJob);

  // Discard a single job
  router.post('/:id/discard', controller.discardJob);

  // Batch operations
  router.post('/retry-batch', controller.retryBatch);
  router.post('/discard-batch', controller.discardBatch);

  // Cleanup old entries
  router.post('/cleanup', controller.cleanup);

  return router;
};
