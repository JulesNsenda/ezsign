import { Router } from 'express';
import { Pool } from 'pg';
import { DocumentController } from '@/controllers/documentController';
import { FieldController } from '@/controllers/fieldController';
import { FieldGroupController } from '@/controllers/fieldGroupController';
import { SignerController } from '@/controllers/signerController';
import { ScheduleController } from '@/controllers/scheduleController';
import { EmailLogController } from '@/controllers/emailLogController';
import * as fieldTableController from '@/controllers/fieldTableController';
import { authenticate } from '@/middleware/auth';
import { createDocumentAccessMiddleware } from '@/middleware/documentAccess';
import { FieldService } from '@/services/fieldService';
import { FieldGroupService } from '@/services/fieldGroupService';
import { SignerService } from '@/services/signerService';
import { DocumentService } from '@/services/documentService';
import { PdfService } from '@/services/pdfService';
import { EmailService, EmailConfig } from '@/services/emailService';
import { createStorageService } from '@/services/storageService';
import { createStorageAdapter } from '@/config/storage';
import { createScheduledSendService } from '@/services/scheduledSendService';
import { createEmailLogService } from '@/services/emailLogService';

export const createDocumentRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new DocumentController(pool);
  const checkDocumentAccess = createDocumentAccessMiddleware(pool);

  // Initialize services for field and signer management
  const pdfService = new PdfService();
  const fieldService = new FieldService(pdfService, pool);
  const signerService = new SignerService(pool);

  // Initialize storage and email services for document and signer operations
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
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

  // Initialize email log service and email service with logging
  const emailLogService = createEmailLogService(pool);
  const emailService = new EmailService(emailConfig, baseUrl, emailLogService);

  // Initialize field group service and controller
  const fieldGroupService = new FieldGroupService(pool);
  const fieldGroupController = new FieldGroupController(fieldGroupService);

  const fieldController = new FieldController(fieldService, signerService);
  const signerController = new SignerController(signerService, pool, documentService, emailService);

  // Initialize email log controller
  const emailLogController = new EmailLogController(pool);

  // Initialize scheduled send service and controller
  const scheduledSendService = createScheduledSendService(pool);
  const scheduleController = new ScheduleController(pool, scheduledSendService, signerService);

  // All document routes require authentication
  router.use(authenticate);

  // Upload a new document
  router.post('/', controller.uploadMiddleware.single('file'), controller.upload);

  // List documents with pagination and filtering (no specific document access check needed)
  router.get('/', controller.list);

  // List documents with cursor-based (keyset) pagination
  router.get('/cursor', controller.listCursor);

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
  router.post('/:id/fields/ungroup', checkDocumentAccess, fieldGroupController.ungroupFields);
  router.get('/:id/fields', checkDocumentAccess, fieldController.getFields);
  router.post('/:id/fields', checkDocumentAccess, fieldController.createField);
  router.get('/:id/fields/:fieldId', checkDocumentAccess, fieldController.getField);
  router.put('/:id/fields/:fieldId', checkDocumentAccess, fieldController.updateField);
  router.delete('/:id/fields/:fieldId', checkDocumentAccess, fieldController.deleteField);

  // Field group management routes
  router.post('/:id/groups/reorder', checkDocumentAccess, fieldGroupController.reorderGroups);
  router.get('/:id/groups', checkDocumentAccess, fieldGroupController.getGroups);
  router.post('/:id/groups', checkDocumentAccess, fieldGroupController.createGroup);
  router.get('/:id/groups/:groupId', checkDocumentAccess, fieldGroupController.getGroup);
  router.put('/:id/groups/:groupId', checkDocumentAccess, fieldGroupController.updateGroup);
  router.delete('/:id/groups/:groupId', checkDocumentAccess, fieldGroupController.deleteGroup);
  router.post('/:id/groups/:groupId/fields', checkDocumentAccess, fieldGroupController.assignFields);
  router.post('/:id/groups/:groupId/fields/reorder', checkDocumentAccess, fieldGroupController.reorderFieldsInGroup);

  // Field table management routes
  router.get('/:id/tables', checkDocumentAccess, fieldTableController.getDocumentTables);
  router.post('/:id/tables', checkDocumentAccess, fieldTableController.createTable);
  router.get('/:id/tables/:tableId', checkDocumentAccess, fieldTableController.getTable);
  router.put('/:id/tables/:tableId', checkDocumentAccess, fieldTableController.updateTable);
  router.delete('/:id/tables/:tableId', checkDocumentAccess, fieldTableController.deleteTable);
  // Table row management
  router.post('/:id/tables/:tableId/rows', checkDocumentAccess, fieldTableController.addRow);
  router.post('/:id/tables/:tableId/rows/reorder', checkDocumentAccess, fieldTableController.reorderRows);
  router.put('/:id/tables/:tableId/rows/:rowId', checkDocumentAccess, fieldTableController.updateRow);
  router.delete('/:id/tables/:tableId/rows/:rowId', checkDocumentAccess, fieldTableController.deleteRow);
  router.put('/:id/tables/:tableId/rows/:rowId/cells/:columnId', checkDocumentAccess, fieldTableController.updateCell);
  // Table column management
  router.post('/:id/tables/:tableId/columns', checkDocumentAccess, fieldTableController.addColumn);
  router.post('/:id/tables/:tableId/columns/reorder', checkDocumentAccess, fieldTableController.reorderColumns);
  router.put('/:id/tables/:tableId/columns/:columnId', checkDocumentAccess, fieldTableController.updateColumn);
  router.delete('/:id/tables/:tableId/columns/:columnId', checkDocumentAccess, fieldTableController.deleteColumn);

  // Schedule management routes
  router.post('/:id/schedule', checkDocumentAccess, scheduleController.scheduleDocument);
  router.delete('/:id/schedule', checkDocumentAccess, scheduleController.cancelScheduledSend);
  router.get('/:id/schedule', checkDocumentAccess, scheduleController.getScheduleStatus);

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

  // Email log routes
  router.get('/:id/emails', checkDocumentAccess, emailLogController.getDocumentEmails);
  router.get('/:id/emails/stats', checkDocumentAccess, emailLogController.getDocumentEmailStats);

  return router;
};
