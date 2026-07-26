import { Pool } from 'pg';
import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { PdfJobData, PdfJobType } from '@/services/pdfQueueService';
import { pdfService } from '@/services/pdfService';
import { getStorageRoot } from '@/config/storage';
import logger from '@/services/loggerService';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * PDF Worker
 *
 * Processes PDF jobs from pg-boss's `pdf-processing` queue. This is a
 * function-based module rather than the old BullMQ-era `PdfWorker` class:
 * pg-boss's `registerWorker` (see `@/config/queue`) owns the worker
 * lifecycle (fetch loop, retries, Dead Letter Queue writes on final
 * failure), so there is no `Worker` instance to hold state on here anymore.
 *
 * Set once by `createPdfWorker` before registration; used by the per-job
 * handlers below for the best-effort DB updates that follow each PDF
 * operation.
 */
let dbPool: Pool | null = null;

/**
 * Generate thumbnail for PDF
 */
async function generateThumbnail(
  jobId: string,
  data: Extract<PdfJobData, { type: PdfJobType.GENERATE_THUMBNAIL }>
): Promise<{ thumbnailPath: string; relativePath: string }> {
  // Read PDF file
  const pdfBuffer = await fs.readFile(data.filePath);

  // Generate thumbnail
  const thumbnail = await pdfService.generateThumbnail(pdfBuffer, {
    maxWidth: data.maxWidth || 200,
    maxHeight: data.maxHeight || 300,
  });

  // Save thumbnail in a structured directory (single canonical root -
  // SEC-C2 item 3.1; `data.filePath` above is already a fully-resolved,
  // guarded absolute path composed upstream by the controller that queued
  // this job, so there is no key here for resolveWithinStorage to check)
  const storagePath = getStorageRoot();
  const thumbnailDir = path.join(storagePath, 'thumbnails');
  await fs.mkdir(thumbnailDir, { recursive: true });

  // Use document ID for consistent naming
  const thumbnailFilename = `${data.documentId}.png`;
  const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
  const relativePath = `thumbnails/${thumbnailFilename}`;

  await fs.writeFile(thumbnailPath, thumbnail);

  // Update database with thumbnail path
  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE documents
         SET thumbnail_path = $1, thumbnail_generated_at = NOW()
         WHERE id = $2`,
        [relativePath, data.documentId]
      );
    } catch (dbError) {
      logger.warn('Failed to update document with thumbnail path', {
        error: (dbError as Error).message,
        documentId: data.documentId,
      });
      // Don't throw - the thumbnail was still generated successfully
    }
  }

  logger.debug('Generated thumbnail for document', { documentId: data.documentId, jobId });
  return { thumbnailPath, relativePath };
}

/**
 * Optimize PDF file size
 */
async function optimizePdf(
  jobId: string,
  data: Extract<PdfJobData, { type: PdfJobType.OPTIMIZE_PDF }>
): Promise<{ optimizedPath: string; sizeSaved: number; originalSize: number; optimizedSize: number }> {
  // Read original file
  const originalBuffer = await fs.readFile(data.filePath);
  const originalSize = originalBuffer.length;

  // Optimize PDF
  const optimizedBuffer = await pdfService.optimizePdf(originalBuffer);
  const optimizedSize = optimizedBuffer.length;

  // Replace original file with optimized version
  await fs.writeFile(data.filePath, optimizedBuffer);

  // Update database with optimization info
  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE documents
         SET is_optimized = true,
             original_file_size = $1,
             file_size = $2,
             optimized_at = NOW()
         WHERE id = $3`,
        [originalSize, optimizedSize, data.documentId]
      );
    } catch (dbError) {
      logger.warn('Failed to update document with optimization info', {
        error: (dbError as Error).message,
        documentId: data.documentId,
      });
    }
  }

  const sizeSaved = originalSize - optimizedSize;
  logger.debug('Optimized document', {
    documentId: data.documentId,
    jobId,
    sizeSaved,
    percentSaved: Math.round((sizeSaved / originalSize) * 100),
  });

  return { optimizedPath: data.filePath, sizeSaved, originalSize, optimizedSize };
}

/**
 * Flatten PDF (remove form fields)
 */
async function flattenPdf(
  jobId: string,
  data: Extract<PdfJobData, { type: PdfJobType.FLATTEN_PDF }>
): Promise<{ flattenedPath: string }> {
  // Read PDF
  const pdfBuffer = await fs.readFile(data.filePath);

  // Flatten
  const flattenedBuffer = await pdfService.flattenPdf(pdfBuffer);

  // Save
  const flattenedPath = data.filePath.replace('.pdf', '_flattened.pdf');
  await fs.writeFile(flattenedPath, flattenedBuffer);

  logger.debug('Flattened document', { documentId: data.documentId, jobId });
  return { flattenedPath };
}

/**
 * Add watermark to PDF
 */
async function addWatermark(
  jobId: string,
  data: Extract<PdfJobData, { type: PdfJobType.ADD_WATERMARK }>
): Promise<{ watermarkedPath: string }> {
  // Read PDF
  const pdfBuffer = await fs.readFile(data.filePath);

  // Add watermark
  const watermarkedBuffer = await pdfService.addWatermark(pdfBuffer, data.watermarkText, data.options);

  // Save
  const watermarkedPath = data.filePath.replace('.pdf', '_watermarked.pdf');
  await fs.writeFile(watermarkedPath, watermarkedBuffer);

  logger.debug('Added watermark to document', { documentId: data.documentId, jobId });
  return { watermarkedPath };
}

/**
 * Merge multiple PDFs
 */
async function mergePdfs(
  jobId: string,
  data: Extract<PdfJobData, { type: PdfJobType.MERGE_PDFS }>
): Promise<{ mergedPath: string }> {
  // Read all PDF files
  const pdfBuffers = await Promise.all(data.filePaths.map((filePath) => fs.readFile(filePath)));

  // Merge PDFs
  const mergedBuffer = await pdfService.mergePdfs(pdfBuffers);

  // Save merged PDF
  await fs.writeFile(data.outputPath, mergedBuffer);

  logger.debug('Merged PDFs', { jobId, count: data.filePaths.length, outputPath: data.outputPath });
  return { mergedPath: data.outputPath };
}

/**
 * Process a PDF job based on its discriminated `type`. This is the handler
 * passed to `registerWorker` - on a throw, `registerWorker` (in
 * `@/config/queue`) writes the job to the Dead Letter Queue if this was its
 * final retry attempt, then rethrows so pg-boss marks it failed/retried.
 * This handler never writes to the DLQ itself, to avoid a double-write.
 *
 * NOTE: BullMQ's `job.updateProgress(N)` calls (previously sprinkled through
 * every branch below) have been removed - pg-boss has no per-job progress
 * API (decision 11, accepted regression). `GET /api/pdf/jobs/:jobId` no
 * longer reports a live percentage.
 */
async function processJob(job: NormalizedJob): Promise<unknown> {
  const data = job.data as PdfJobData;

  logger.debug('Processing PDF job', { jobId: job.id, type: data.type });

  try {
    switch (data.type) {
      case PdfJobType.GENERATE_THUMBNAIL:
        return await generateThumbnail(job.id, data);

      case PdfJobType.OPTIMIZE_PDF:
        return await optimizePdf(job.id, data);

      case PdfJobType.FLATTEN_PDF:
        return await flattenPdf(job.id, data);

      case PdfJobType.ADD_WATERMARK:
        return await addWatermark(job.id, data);

      case PdfJobType.MERGE_PDFS:
        return await mergePdfs(job.id, data);

      default:
        throw new Error(`Unknown job type: ${(data as { type: string }).type}`);
    }
  } catch (error) {
    logger.error('PDF job failed', { jobId: job.id, error: (error as Error).message });
    throw error;
  }
}

/**
 * Register the PDF processing worker against the shared pg-boss singleton.
 *
 * Must be called after `startQueues(pool)` has resolved (it calls into
 * `@/config/queue`'s `registerWorker`, which throws if the boss hasn't been
 * started yet). `localConcurrency: 3` replaces BullMQ's `concurrency: 3`;
 * the old `limiter: { max: 5, duration: 1000 }` throttle has no pg-boss
 * analog and was dropped (decision 11, accepted regression).
 */
export async function createPdfWorker(pool: Pool): Promise<void> {
  dbPool = pool;

  await registerWorker(QueueName.PDF_PROCESSING, processJob, {
    localConcurrency: 3,
  });

  logger.info('PDF worker registered', { queue: QueueName.PDF_PROCESSING });
}
