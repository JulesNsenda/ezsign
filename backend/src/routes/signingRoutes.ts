import { Router } from 'express';
import { Pool } from 'pg';
import { SigningController } from '@/controllers/signingController';
import { authenticate } from '@/middleware/auth';
import { embedSecurity } from '@/middleware/embedSecurity';
import { EmailService } from '@/services/emailService';
import { PdfService } from '@/services/pdfService';
import { createStorageService } from '@/services/storageService';
import { createStorageAdapter } from '@/config/storage';
import { createEmailLogService } from '@/services/emailLogService';
import { createReminderService } from '@/services/reminderService';
import { getSettingsService } from '@/services/settingsService';

export const createSigningRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
  const pdfService = new PdfService();

  // Initialize email log service and email service. Config (SMTP + app URL)
  // is resolved fresh from instance settings (DB -> env -> default) on every
  // send - see settingsService.getEmailConfig().
  const emailLogService = createEmailLogService(pool);
  const emailService = EmailService.withProvider(
    () => getSettingsService(pool).getEmailConfig(),
    emailLogService
  );

  // Initialize reminder service for deadline reminders
  const reminderService = createReminderService(pool);

  const signingController = new SigningController(pool, emailService, pdfService, storageService, reminderService);

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

  // Initialize email log service and email service. Config (SMTP + app URL)
  // is resolved fresh from instance settings (DB -> env -> default) on every
  // send - see settingsService.getEmailConfig().
  const emailLogService = createEmailLogService(pool);
  const emailService = EmailService.withProvider(
    () => getSettingsService(pool).getEmailConfig(),
    emailLogService
  );

  // Initialize reminder service for deadline reminders
  const reminderService = createReminderService(pool);

  const signingController = new SigningController(pool, emailService, pdfService, storageService, reminderService);

  // Protected routes (require authentication)
  router.use(authenticate);
  router.post('/:id/send', signingController.sendForSignature);
  router.get('/:id/status', signingController.getSigningStatus);

  return router;
};
