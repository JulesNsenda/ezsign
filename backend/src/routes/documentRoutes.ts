import { Router } from 'express';
import { Pool } from 'pg';
import { DocumentController } from '@/controllers/documentController';
import { FieldController } from '@/controllers/fieldController';
import { SignerController } from '@/controllers/signerController';
import { authenticate } from '@/middleware/auth';
import { createDocumentAccessMiddleware } from '@/middleware/documentAccess';
import { FieldService } from '@/services/fieldService';
import { SignerService } from '@/services/signerService';
import { DocumentService } from '@/services/documentService';
import { PdfService } from '@/services/pdfService';
import { EmailService, EmailConfig } from '@/services/emailService';
import { StorageService } from '@/services/storageService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';

export const createDocumentRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new DocumentController(pool);
  const checkDocumentAccess = createDocumentAccessMiddleware(pool);

  // Initialize services for field and signer management
  const pdfService = new PdfService();
  const fieldService = new FieldService(pdfService, pool);
  const signerService = new SignerService(pool);

  // Initialize storage and email services for document and signer operations
  const storagePath = process.env.FILE_STORAGE_PATH || './storage';
  const storageAdapter = new LocalStorageAdapter(storagePath);
  const storageService = new StorageService(storageAdapter);
  const documentService = new DocumentService(pool, storageService);

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

  const fieldController = new FieldController(fieldService, signerService);
  const signerController = new SignerController(signerService, pool, documentService, emailService);

  // All document routes require authentication
  router.use(authenticate);

  // Upload a new document
  router.post('/', controller.uploadMiddleware.single('file'), controller.upload);

  // List documents with pagination and filtering (no specific document access check needed)
  router.get('/', controller.list);

  // Specific routes must come before parameterized routes
  // Routes that require document access verification
  // Get document metadata
  router.get('/:id/metadata', checkDocumentAccess, controller.getMetadata);

  // Download a document
  router.get('/:id/download', checkDocumentAccess, controller.download);

  // Get document thumbnail
  router.get('/:id/thumbnail', checkDocumentAccess, controller.getThumbnail);

  // Get a single document
  router.get('/:id', checkDocumentAccess, controller.getById);

  // Update a document (only owner can update)
  router.put('/:id', controller.update);

  // Delete a document (only owner can delete)
  router.delete('/:id', controller.delete);

  // Field management routes
  router.get('/:id/fields/validate', checkDocumentAccess, fieldController.validateFields);
  router.post('/:id/fields/bulk', checkDocumentAccess, fieldController.bulkUpsertFields);
  router.get('/:id/fields', checkDocumentAccess, fieldController.getFields);
  router.post('/:id/fields', checkDocumentAccess, fieldController.createField);
  router.get('/:id/fields/:fieldId', checkDocumentAccess, fieldController.getField);
  router.put('/:id/fields/:fieldId', checkDocumentAccess, fieldController.updateField);
  router.delete('/:id/fields/:fieldId', checkDocumentAccess, fieldController.deleteField);

  // Signer management routes
  router.get('/:id/signers/validate', checkDocumentAccess, signerController.validateSigners);
  router.get('/:id/signers', checkDocumentAccess, signerController.getSigners);
  router.post('/:id/signers', checkDocumentAccess, signerController.createSigner);
  router.get('/:id/signers/:signerId', checkDocumentAccess, signerController.getSigner);
  router.get('/:id/signers/:signerId/can-sign', checkDocumentAccess, signerController.canSign);
  router.put('/:id/signers/:signerId', checkDocumentAccess, signerController.updateSigner);
  router.delete('/:id/signers/:signerId', checkDocumentAccess, signerController.deleteSigner);
  router.post('/:id/signers/:signerId/assign-fields', checkDocumentAccess, signerController.assignFields);
  router.post('/:id/signers/:signerId/resend', checkDocumentAccess, signerController.resendSigningEmail);

  return router;
};
