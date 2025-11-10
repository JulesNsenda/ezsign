/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-promises */
import { Job } from 'bullmq';
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

  constructor() {
    this.worker = createWorker<PdfJobData>(QueueName.PDF_PROCESSING, this.processJob.bind(this), {
      concurrency: 3, // Process 3 PDF jobs concurrently
      limiter: {
        max: 5,
        duration: 1000,
      },
    });

    this.setupEventListeners();
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
  private async generateThumbnail(job: Job<PdfJobData>): Promise<{ thumbnailPath: string }> {
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

    // Save thumbnail
    const thumbnailDir = path.join(path.dirname(data.filePath), 'thumbnails');
    await fs.mkdir(thumbnailDir, { recursive: true });

    const thumbnailPath = path.join(
      thumbnailDir,
      `${path.basename(data.filePath, '.pdf')}_thumbnail.png`,
    );
    await fs.writeFile(thumbnailPath, thumbnail);
    await job.updateProgress(100);

    console.log(`Generated thumbnail for document ${data.documentId}`);
    return { thumbnailPath };
  }

  /**
   * Optimize PDF file size
   */
  private async optimizePdf(
    job: Job<PdfJobData>,
  ): Promise<{ optimizedPath: string; sizeSaved: number }> {
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

    // Save optimized version
    const optimizedPath = data.filePath.replace('.pdf', '_optimized.pdf');
    await fs.writeFile(optimizedPath, optimizedBuffer);
    await job.updateProgress(100);

    const sizeSaved = originalSize - optimizedSize;
    console.log(`Optimized document ${data.documentId}, saved ${sizeSaved} bytes`);

    return { optimizedPath, sizeSaved };
  }

  /**
   * Flatten PDF (remove form fields)
   */
  private async flattenPdf(job: Job<PdfJobData>): Promise<{ flattenedPath: string }> {
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
  private async addWatermark(job: Job<PdfJobData>): Promise<{ watermarkedPath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.ADD_WATERMARK }>;

    await job.updateProgress(20);

    // Read PDF
    const pdfBuffer = await fs.readFile(data.filePath);
    await job.updateProgress(40);

    // Add watermark
    const watermarkedBuffer = await pdfService.addWatermark(
      pdfBuffer,
      data.watermarkText,
      data.options,
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
  private async mergePdfs(job: Job<PdfJobData>): Promise<{ mergedPath: string }> {
    const data = job.data as Extract<PdfJobData, { type: PdfJobType.MERGE_PDFS }>;

    await job.updateProgress(10);

    // Read all PDF files
    const pdfBuffers = await Promise.all(data.filePaths.map((filePath) => fs.readFile(filePath)));
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

// Create and export worker instance
export const pdfWorker = new PdfWorker();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing PDF worker...');
  await pdfWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing PDF worker...');
  await pdfWorker.close();
  process.exit(0);
});
