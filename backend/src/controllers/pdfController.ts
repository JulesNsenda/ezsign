import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { pdfQueueService } from '@/services/pdfQueueService';
import { DocumentService } from '@/services/documentService';
import { StorageService, createStorageService } from '@/services/storageService';
import { createStorageAdapter, getStorageConfig } from '@/config/storage';
import path from 'path';

/**
 * PDF Controller
 * Handles PDF processing operations via the queue system
 */
export class PdfController {
  private pool: Pool;
  private documentService: DocumentService;
  private storageService: StorageService;
  private storagePath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    const storageConfig = getStorageConfig();
    // For local storage, use the configured path; for S3, use temp directory for local processing
    this.storagePath = storageConfig.local?.basePath || process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const storageAdapter = createStorageAdapter(storageConfig);
    this.storageService = createStorageService(storageAdapter);
    this.documentService = new DocumentService(pool, this.storageService);
  }

  /**
   * Get document thumbnail
   * GET /api/pdf/documents/:id/thumbnail
   *
   * Returns the thumbnail if it exists, otherwise queues generation
   */
  getThumbnail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documentId = req.params.id;
      const userId = req.user?.userId;

      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get document to verify access and get file path
      const document = await this.documentService.findById(documentId, userId);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      // Check if thumbnail exists in database
      const thumbnailQuery = 'SELECT thumbnail_path FROM documents WHERE id = $1';
      const thumbnailResult = await this.pool.query(thumbnailQuery, [documentId]);
      const thumbnailPath = thumbnailResult.rows[0]?.thumbnail_path;

      if (thumbnailPath) {
        // Check if file exists
        const exists = await this.storageService.fileExists(thumbnailPath);
        if (exists) {
          const thumbnailBuffer = await this.storageService.downloadFile(thumbnailPath);
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
          res.send(thumbnailBuffer);
          return;
        }
      }

      // Thumbnail doesn't exist, queue generation
      const filePath = path.join(this.storagePath, document.file_path);
      const job = await pdfQueueService.addThumbnailJob({
        documentId,
        filePath,
        maxWidth: 200,
        maxHeight: 300,
      });

      res.status(202).json({
        message: 'Thumbnail generation queued',
        jobId: job.id || 'unknown',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Regenerate document thumbnail
   * POST /api/pdf/documents/:id/thumbnail/regenerate
   */
  regenerateThumbnail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documentId = req.params.id;
      const userId = req.user?.userId;

      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get document to verify access and get file path
      const document = await this.documentService.findById(documentId, userId);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      const filePath = path.join(this.storagePath, document.file_path);
      const job = await pdfQueueService.addThumbnailJob({
        documentId,
        filePath,
        maxWidth: 200,
        maxHeight: 300,
      });

      res.status(202).json({
        message: 'Thumbnail regeneration queued',
        jobId: job.id || 'unknown',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Optimize PDF file
   * POST /api/pdf/documents/:id/optimize
   *
   * Only available for draft documents
   */
  optimizePdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documentId = req.params.id;
      const userId = req.user?.userId;

      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get document to verify access
      const document = await this.documentService.findById(documentId, userId);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      // Only allow optimization for draft documents
      if (document.status !== 'draft') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Can only optimize draft documents',
        });
        return;
      }

      // Check if already optimized
      const optimizedQuery = 'SELECT is_optimized FROM documents WHERE id = $1';
      const optimizedResult = await this.pool.query(optimizedQuery, [documentId]);
      if (optimizedResult.rows[0]?.is_optimized) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document has already been optimized',
        });
        return;
      }

      const filePath = path.join(this.storagePath, document.file_path);
      const job = await pdfQueueService.addOptimizationJob({
        documentId,
        filePath,
      });

      res.status(202).json({
        message: 'PDF optimization queued',
        jobId: job.id || 'unknown',
        originalSize: document.file_size,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get watermarked preview of draft document
   * GET /api/pdf/documents/:id/preview
   */
  getWatermarkedPreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documentId = req.params.id;
      const watermarkText = (req.query.text as string) || 'DRAFT';
      const userId = req.user?.userId;

      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get document to verify access
      const document = await this.documentService.findById(documentId, userId);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      // For non-draft documents, return original PDF
      if (document.status !== 'draft') {
        const fileBuffer = await this.storageService.downloadFile(document.file_path);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);
        res.send(fileBuffer);
        return;
      }

      // For draft, check if watermarked version exists in temp
      const tempWatermarkPath = `temp/watermarked-${documentId}.pdf`;
      const exists = await this.storageService.fileExists(tempWatermarkPath);

      if (exists) {
        const watermarkedBuffer = await this.storageService.downloadFile(tempWatermarkPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="preview-${document.original_filename}"`);
        res.send(watermarkedBuffer);
        return;
      }

      // Queue watermark generation
      const filePath = path.join(this.storagePath, document.file_path);
      const job = await pdfQueueService.addWatermarkJob({
        documentId,
        filePath,
        watermarkText,
        options: {
          fontSize: 72,
          opacity: 0.3,
          rotation: 45,
        },
      });

      res.status(202).json({
        message: 'Watermarked preview generation queued',
        jobId: job.id || 'unknown',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get job status
   * GET /api/pdf/jobs/:jobId
   */
  getJobStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = req.params.jobId;

      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!jobId) {
        res.status(400).json({ error: 'Job ID is required' });
        return;
      }

      const status = await pdfQueueService.getJobStatus(jobId);

      if (!status) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(status);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get queue metrics
   * GET /api/pdf/metrics
   *
   * Admin endpoint for monitoring
   */
  getQueueMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const metrics = await pdfQueueService.getMetrics();
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  };
}
