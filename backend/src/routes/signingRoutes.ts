import { Router } from 'express';
import { Pool } from 'pg';
import { SigningController } from '@/controllers/signingController';
import { authenticate } from '@/middleware/auth';
import { embedSecurity } from '@/middleware/embedSecurity';
import { EmailService, EmailConfig } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { createStorageService } from '@/services/storageService';
import { createStorageAdapter } from '@/config/storage';
import { createEmailLogService } from '@/services/emailLogService';

export const createSigningRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
  const pdfService = new PdfService();

  const emailUser = process.env.EMAIL_SMTP_USER || '';
  const emailPass = process.env.EMAIL_SMTP_PASS || '';

  const emailConfig: EmailConfig = {
    host: process.env.EMAIL_SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: emailUser && emailPass ? {
      user: emailUser,
      pass: emailPass,
    } : undefined,
    from: process.env.EMAIL_FROM || 'noreply@ezsign.com',
  };

  const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000';

  // Initialize email log service and email service with logging
  const emailLogService = createEmailLogService(pool);
  const emailService = new EmailService(emailConfig, baseUrl, emailLogService);

  const signingController = new SigningController(pool, emailService, pdfService, storageService);

  // Public routes (no authentication required)
  // Apply embed security middleware for iframe embedding support
  router.get('/:token', embedSecurity, signingController.getDocumentBySigningToken);
  router.get('/:token/download', embedSecurity, signingController.downloadDocumentByToken);
  router.post('/:token/sign', embedSecurity, signingController.submitSignature);

  return router;
};

export const createDocumentSigningRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services (same as above)
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
  const pdfService = new PdfService();

  const emailUser = process.env.EMAIL_SMTP_USER || '';
  const emailPass = process.env.EMAIL_SMTP_PASS || '';

  const emailConfig: EmailConfig = {
    host: process.env.EMAIL_SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: emailUser && emailPass ? {
      user: emailUser,
      pass: emailPass,
    } : undefined,
    from: process.env.EMAIL_FROM || 'noreply@ezsign.com',
  };

  const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000';

  // Initialize email log service and email service with logging
  const emailLogService = createEmailLogService(pool);
  const emailService = new EmailService(emailConfig, baseUrl, emailLogService);

  const signingController = new SigningController(pool, emailService, pdfService, storageService);

  // Protected routes (require authentication)
  router.use(authenticate);
  router.post('/:id/send', signingController.sendForSignature);
  router.get('/:id/status', signingController.getSigningStatus);

  return router;
};
