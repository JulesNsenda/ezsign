import { Router } from 'express';
import { Pool } from 'pg';
import { TwoFactorService } from '@/services/twoFactorService';
import { createTwoFactorController } from '@/controllers/twoFactorController';
import { authenticate } from '@/middleware/auth';
import { twoFactorLimiter } from '@/middleware/rateLimiter';

export const createTwoFactorRouter = (pool: Pool): Router => {
  const router = Router();
  const twoFactorService = new TwoFactorService(pool);
  const controller = createTwoFactorController(twoFactorService);

  // Protected routes (require full authentication)
  // Initialize 2FA setup
  router.post('/setup', authenticate, controller.setupInit);

  // Complete 2FA setup
  router.post('/verify-setup', authenticate, controller.setupComplete);

  // Get 2FA status
  router.get('/status', authenticate, controller.getStatus);

  // Disable 2FA
  router.delete('/', authenticate, controller.disable);

  // Regenerate backup codes
  router.post('/backup-codes', authenticate, controller.regenerateBackupCodes);

  // Semi-authenticated routes (for login flow - rate limited)
  // Verify 2FA code during login
  router.post('/verify', twoFactorLimiter, controller.verify);

  // Verify backup code during login
  router.post('/verify-backup', twoFactorLimiter, controller.verifyBackup);

  return router;
};

export default createTwoFactorRouter;
