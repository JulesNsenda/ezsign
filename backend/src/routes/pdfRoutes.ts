import { Router } from 'express';
import { Pool } from 'pg';
import { PdfController } from '@/controllers/pdfController';
import { authenticate } from '@/middleware/auth';
import { createDocumentAccessMiddleware } from '@/middleware/documentAccess';

/**
 * Create PDF processing routes
 *
 * These routes provide async PDF processing capabilities:
 * - Thumbnail generation
 * - PDF optimization
 * - Watermarked preview
 * - Job status tracking
 */
export const createPdfRouter = (pool: Pool): Router => {
  const router = Router();
  const controller = new PdfController(pool);
  const checkDocumentAccess = createDocumentAccessMiddleware(pool);

  // All PDF routes require authentication
  router.use(authenticate);

  // Thumbnail endpoints
  // GET /api/pdf/documents/:id/thumbnail - Get thumbnail (or queue generation)
  router.get(
    '/documents/:id/thumbnail',
    checkDocumentAccess,
    controller.getThumbnail
  );

  // POST /api/pdf/documents/:id/thumbnail/regenerate - Force regenerate thumbnail
  router.post(
    '/documents/:id/thumbnail/regenerate',
    checkDocumentAccess,
    controller.regenerateThumbnail
  );

  // PDF processing endpoints
  // POST /api/pdf/documents/:id/optimize - Optimize PDF (reduce file size)
  router.post(
    '/documents/:id/optimize',
    checkDocumentAccess,
    controller.optimizePdf
  );

  // GET /api/pdf/documents/:id/preview - Get watermarked preview for drafts
  router.get(
    '/documents/:id/preview',
    checkDocumentAccess,
    controller.getWatermarkedPreview
  );

  // Job status endpoint
  // GET /api/pdf/jobs/:jobId - Get job status
  router.get('/jobs/:jobId', controller.getJobStatus);

  // Queue metrics (monitoring)
  // GET /api/pdf/metrics - Get queue statistics
  router.get('/metrics', controller.getQueueMetrics);

  return router;
};
