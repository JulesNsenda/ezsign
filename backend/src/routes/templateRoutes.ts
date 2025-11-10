import { Router } from 'express';
import { Pool } from 'pg';
import { TemplateController } from '@/controllers/templateController';
import { authenticate } from '@/middleware/auth';
import { TemplateService } from '@/services/templateService';
import { StorageService } from '@/services/storageService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { PdfService } from '@/services/pdfService';

export const createTemplateRouter = (pool: Pool): Router => {
  const router = Router();

  // Initialize services
  const storagePath = process.env.FILE_STORAGE_PATH || './storage';
  const storageAdapter = new LocalStorageAdapter(storagePath);
  const storageService = new StorageService(storageAdapter);
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
