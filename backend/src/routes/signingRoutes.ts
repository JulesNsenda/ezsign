import { Router } from 'express';
import { Pool } from 'pg';
import { SigningController } from '@/controllers/signingController';
import { authenticate } from '@/middleware/auth';
import { EmailService, EmailConfig } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { StorageService } from '@/services/storageService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';

export const createSigningRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services
  const storagePath = process.env.FILE_STORAGE_PATH || './storage';
  const storageAdapter = new LocalStorageAdapter(storagePath);
  const storageService = new StorageService(storageAdapter);
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
  const emailService = new EmailService(emailConfig, baseUrl);

  const signingController = new SigningController(pool, emailService, pdfService, storageService);

  // Public routes (no authentication required)
  router.get('/:token', signingController.getDocumentBySigningToken);
  router.get('/:token/download', signingController.downloadDocumentByToken);
  router.post('/:token/sign', signingController.submitSignature);

  return router;
};

export const createDocumentSigningRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services (same as above)
  const storagePath = process.env.FILE_STORAGE_PATH || './storage';
  const storageAdapter = new LocalStorageAdapter(storagePath);
  const storageService = new StorageService(storageAdapter);
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
  const emailService = new EmailService(emailConfig, baseUrl);

  const signingController = new SigningController(pool, emailService, pdfService, storageService);

  // Protected routes (require authentication)
  router.use(authenticate);
  router.post('/:id/send', signingController.sendForSignature);
  router.get('/:id/status', signingController.getSigningStatus);

  return router;
};
