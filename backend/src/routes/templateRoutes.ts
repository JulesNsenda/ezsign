import { Router } from 'express';
import { Pool } from 'pg';
import { TemplateController } from '@/controllers/templateController';
import { authenticate } from '@/middleware/auth';
import { TemplateService } from '@/services/templateService';
import { createStorageService } from '@/services/storageService';
import { createStorageAdapter } from '@/config/storage';
import { PdfService } from '@/services/pdfService';

export const createTemplateRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services
  const storageAdapter = createStorageAdapter();
  const storageService = createStorageService(storageAdapter);
  const pdfService = new PdfService();
  const templateService = new TemplateService(pool, storageService, pdfService);
  const templateController = new TemplateController(templateService);

  // All template routes require authentication
  router.use(authenticate);

  // Template CRUD routes
  router.post('/', templateController.createFromDocument);
  router.get('/', templateController.list);
  router.get('/:id', templateController.getById);
  router.put('/:id', templateController.update);
  router.delete('/:id', templateController.delete);

  // Create document from template
  router.post('/:id/documents', templateController.createDocument);

  return router;
};
