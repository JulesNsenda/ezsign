import { Router } from 'express';
import { Pool } from 'pg';
import { ApiKeyController } from '@/controllers/apiKeyController';
import { authenticate } from '@/middleware/auth';

export const createApiKeysRouter = (pool: Pool): Router => {
  const router = Router();
  const apiKeyController = new ApiKeyController(pool);

  // All routes require authentication
  router.use(authenticate);

  // Get all API keys for authenticated user
  router.get('/', apiKeyController.getApiKeys);

  // Create a new API key
  router.post('/', apiKeyController.createApiKey);

  // Get a specific API key
  router.get('/:id', apiKeyController.getApiKey);

  // Update an API key
  router.put('/:id', apiKeyController.updateApiKey);

  // Delete an API key
  router.delete('/:id', apiKeyController.deleteApiKey);

  return router;
};
