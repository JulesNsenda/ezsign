import { Job } from 'bullmq';
import { Pool } from 'pg';
import { createWorker, QueueName } from '@/config/queue';
import { PdfJobData, PdfJobType } from '@/services/pdfQueueService';
import { pdfService } from '@/services/pdfService';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * PDF Worker
 * Processes PDF jobs from the queue
 */
export class PdfWorker {
  private worker;
  private pool: Pool | null;

  constructor(pool?: Pool) {
    this.pool = pool || null;

    this.worker = createWorker<PdfJobData>(
      QueueName.PDF_PROCESSING,
      this.processJob.bind(this),
      {
        concurrency: 3, // Process 3 PDF jobs concurrently
        limiter: {
          max: 5,
          duration: 1000,
        },
      }
    );

    this.setupEventListeners();
  }

  /**
   * Set database pool for database updates
   */
  setPool(pool: Pool): void {
    this.pool = pool;
  }

  /**
   * Process PDF job based on type
   */
  private async processJob(job: Job<PdfJobData>): Promise<any> {
    console.log(`Processing PDF job ${job.id} of type ${job.data.type}`);

    try {
      switch (job.data.type) {
        case PdfJobType.GENERATE_THUMBNAIL:
          return await this.generateThumbnail(job);

        case PdfJobType.OPTIMIZE_PDF:
          return await this.optimizePdf(job);

        case PdfJobType.FLATTEN_PDF:
          return await this.flattenPdf(job);

        case PdfJobType.ADD_WATERMARK:
          return await this.addWatermark(job);

        case PdfJobType.MERGE_PDFS:
          return await this.mergePdfs(job);

        default:
          throw new Error(`Unknown job type: ${(job.data as any).type}`);
      }
    } catch (error) {
      console.error(`PDF job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Generate thumbnail for PDF
   */
  private async generateThumbnail(
    job: Job<PdfJobData>
  ): Promise<{ thumbnailPath: string; relativePath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.GENERATE_THUMBNAIL }>;

    await job.updateProgress(10);

    // Read PDF file
    const pdfBuffer = await fs.readFile(data.filePath);
    await job.updateProgress(30);

    // Generate thumbnail
    const thumbnail = await pdfService.generateThumbnail(pdfBuffer, {
      maxWidth: data.maxWidth || 200,
      maxHeight: data.maxHeight || 300,
    });
    await job.updateProgress(70);

    // Save thumbnail in a structured directory
    // Get storage base path from environment or use default
    const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const thumbnailDir = path.join(storagePath, 'thumbnails');
    await fs.mkdir(thumbnailDir, { recursive: true });

    // Use document ID for consistent naming
    const thumbnailFilename = `${data.documentId}.png`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    const relativePath = `thumbnails/${thumbnailFilename}`;

    await fs.writeFile(thumbnailPath, thumbnail);
    await job.updateProgress(90);

    // Update database with thumbnail path
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE documents
           SET thumbnail_path = $1, thumbnail_generated_at = NOW()
           WHERE id = $2`,
          [relativePath, data.documentId]
        );
      } catch (dbError) {
        console.error('Failed to update document with thumbnail path:', dbError);
        // Don't throw - the thumbnail was still generated successfully
      }
    }

    await job.updateProgress(100);

    console.log(`Generated thumbnail for document ${data.documentId}`);
    return { thumbnailPath, relativePath };
  }

  /**
   * Optimize PDF file size
   */
  private async optimizePdf(
    job: Job<PdfJobData>
  ): Promise<{ optimizedPath: string; sizeSaved: number; originalSize: number; optimizedSize: number }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.OPTIMIZE_PDF }>;

    await job.updateProgress(10);

    // Read original file
    const originalBuffer = await fs.readFile(data.filePath);
    const originalSize = originalBuffer.length;
    await job.updateProgress(30);

    // Optimize PDF
    const optimizedBuffer = await pdfService.optimizePdf(originalBuffer);
    const optimizedSize = optimizedBuffer.length;
    await job.updateProgress(70);

    // Replace original file with optimized version
    await fs.writeFile(data.filePath, optimizedBuffer);
    await job.updateProgress(85);

    // Update database with optimization info
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE documents
           SET is_optimized = true,
               original_file_size = $1,
               file_size = $2,
               optimized_at = NOW()
           WHERE id = $3`,
          [originalSize, optimizedSize, data.documentId]
        );
      } catch (dbError) {
        console.error('Failed to update document with optimization info:', dbError);
      }
    }

    await job.updateProgress(100);

    const sizeSaved = originalSize - optimizedSize;
    console.log(`Optimized document ${data.documentId}, saved ${sizeSaved} bytes (${Math.round((sizeSaved / originalSize) * 100)}%)`);

    return { optimizedPath: data.filePath, sizeSaved, originalSize, optimizedSize };
  }

  /**
   * Flatten PDF (remove form fields)
   */
  private async flattenPdf(
    job: Job<PdfJobData>
  ): Promise<{ flattenedPath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.FLATTEN_PDF }>;

    await job.updateProgress(20);

    // Read PDF
    const pdfBuffer = await fs.readFile(data.filePath);
    await job.updateProgress(40);

    // Flatten
    const flattenedBuffer = await pdfService.flattenPdf(pdfBuffer);
    await job.updateProgress(80);

    // Save
    const flattenedPath = data.filePath.replace('.pdf', '_flattened.pdf');
    await fs.writeFile(flattenedPath, flattenedBuffer);
    await job.updateProgress(100);

    console.log(`Flattened document ${data.documentId}`);
    return { flattenedPath };
  }

  /**
   * Add watermark to PDF
   */
  private async addWatermark(
    job: Job<PdfJobData>
  ): Promise<{ watermarkedPath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.ADD_WATERMARK }>;

    await job.updateProgress(20);

    // Read PDF
    const pdfBuffer = await fs.readFile(data.filePath);
    await job.updateProgress(40);

    // Add watermark
    const watermarkedBuffer = await pdfService.addWatermark(
      pdfBuffer,
      data.watermarkText,
      data.options
    );
    await job.updateProgress(80);

    // Save
    const watermarkedPath = data.filePath.replace('.pdf', '_watermarked.pdf');
    await fs.writeFile(watermarkedPath, watermarkedBuffer);
    await job.updateProgress(100);

    console.log(`Added watermark to document ${data.documentId}`);
    return { watermarkedPath };
  }

  /**
   * Merge multiple PDFs
   */
  private async mergePdfs(
    job: Job<PdfJobData>
  ): Promise<{ mergedPath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.MERGE_PDFS }>;

    await job.updateProgress(10);

    // Read all PDF files
    const pdfBuffers = await Promise.all(
      data.filePaths.map((filePath) => fs.readFile(filePath))
    );
    await job.updateProgress(40);

    // Merge PDFs
    const mergedBuffer = await pdfService.mergePdfs(pdfBuffers);
    await job.updateProgress(80);

    // Save merged PDF
    await fs.writeFile(data.outputPath, mergedBuffer);
    await job.updateProgress(100);

    console.log(`Merged ${data.filePaths.length} PDFs into ${data.outputPath}`);
    return { mergedPath: data.outputPath };
  }

  /**
   * Set up event listeners for the worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<PdfJobData>) => {
      console.log(`PDF job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job: Job<PdfJobData> | undefined, error: Error) => {
      console.error(`PDF job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error: Error) => {
      console.error('PDF worker error:', error);
    });
  }

  /**
   * Close worker connection
   */
  async close(): Promise<void> {
    await this.worker.close();
  }
}

/**
 * Factory function to create PDF worker with database pool
 */
export function createPdfWorker(pool: Pool): PdfWorker {
  return new PdfWorker(pool);
}
