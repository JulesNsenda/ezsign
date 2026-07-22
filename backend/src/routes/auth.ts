import { Router } from 'express';
import { Pool } from 'pg';
import { AuthController } from '@/controllers/authController';
import { EmailService } from '@/services/emailService';
import { createEmailLogService } from '@/services/emailLogService';
import { getSettingsService } from '@/services/settingsService';
import { authenticate } from '@/middleware/auth';
import { passwordChangeLimiter, twoFactorLimiter } from '@/middleware/rateLimiter';

export const createAuthRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize email service. Config (SMTP + app URL) is resolved fresh from
  // instance settings (DB -> env -> default) on every send - see
  // settingsService.getEmailConfig().
  const emailLogService = createEmailLogService(pool);
  const emailService = EmailService.withProvider(
    () => getSettingsService(pool).getEmailConfig(),
    emailLogService
  );

  const authController = new AuthController(pool, emailService);

  // Register a new user
  router.post('/register', authController.register);

  // Verify email
  router.post('/verify-email', authController.verifyEmail);

  // Login
  router.post('/login', authController.login);

  // Verify 2FA during login
  router.post('/verify-2fa', twoFactorLimiter, authController.verify2fa);

  // Logout (optionally with token in header to blacklist)
  router.post('/logout', authController.logout);

  // Logout from all devices (requires authentication)
  router.post('/logout-all', authenticate, authController.logoutAll);

  // Forgot password
  router.post('/forgot-password', authController.forgotPassword);

  // Reset password
  router.post('/reset-password', authController.resetPassword);

  // Refresh token
  router.post('/refresh', authController.refresh);

  // Get current user (requires authentication)
  router.get('/me', authenticate, authController.me);

  // Change password (requires authentication and rate limiting)
  router.post(
    '/change-password',
    authenticate,
    passwordChangeLimiter,
    authController.changePassword
  );

  return router;
};
