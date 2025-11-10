import { Router } from 'express';
import { Pool } from 'pg';
import { AuthController } from '@/controllers/authController';
import { EmailService, EmailConfig } from '@/services/emailService';
import { authenticate } from '@/middleware/auth';
import { passwordChangeLimiter } from '@/middleware/rateLimiter';

export const createAuthRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize email service
  const emailUser = process.env.EMAIL_SMTP_USER || '';
  const emailPass = process.env.EMAIL_SMTP_PASS || '';

  const emailConfig: EmailConfig = {
    host: process.env.EMAIL_SMTP_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '1025'),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: emailUser && emailPass ? {
      user: emailUser,
      pass: emailPass,
    } : undefined,
    from: process.env.EMAIL_FROM_ADDRESS || 'noreply@ezsign.local',
  };

  const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000';
  const emailService = new EmailService(emailConfig, baseUrl);

  const authController = new AuthController(pool, emailService);

  // Register a new user
  router.post('/register', authController.register);

  // Verify email
  router.post('/verify-email', authController.verifyEmail);

  // Login
  router.post('/login', authController.login);

  // Logout
  router.post('/logout', authController.logout);

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
