import { Queue, Job } from 'bullmq';
import { createQueue, QueueName } from '@/config/queue';

/**
 * PDF processing job types
 */
export enum PdfJobType {
  GENERATE_THUMBNAIL = 'generate-thumbnail',
  OPTIMIZE_PDF = 'optimize-pdf',
  FLATTEN_PDF = 'flatten-pdf',
  ADD_WATERMARK = 'add-watermark',
  MERGE_PDFS = 'merge-pdfs',
}

/**
 * Job data interfaces
 */
export interface GenerateThumbnailJobData {
  type: PdfJobType.GENERATE_THUMBNAIL;
  documentId: string;
  filePath: string;
  maxWidth?: number;
  maxHeight?: number;
}

export interface OptimizePdfJobData {
  type: PdfJobType.OPTIMIZE_PDF;
  documentId: string;
  filePath: string;
}

export interface FlattenPdfJobData {
  type: PdfJobType.FLATTEN_PDF;
  documentId: string;
  filePath: string;
}

export interface AddWatermarkJobData {
  type: PdfJobType.ADD_WATERMARK;
  documentId: string;
  filePath: string;
  watermarkText: string;
  options?: {
    fontSize?: number;
    opacity?: number;
    rotation?: number;
    color?: { r: number; g: number; b: number };
  };
}

export interface MergePdfsJobData {
  type: PdfJobType.MERGE_PDFS;
  documentIds: string[];
  filePaths: string[];
  outputPath: string;
}

export type PdfJobData =
  | GenerateThumbnailJobData
  | OptimizePdfJobData
  | FlattenPdfJobData
  | AddWatermarkJobData
  | MergePdfsJobData;

/**
 * PDF Processing Queue Service
 * Manages PDF processing jobs with BullMQ
 */
export class PdfQueueService {
  private queue: Queue<PdfJobData>;

  constructor() {
    this.queue = createQueue(QueueName.PDF_PROCESSING);
  }

  /**
   * Add thumbnail generation job
   */
  async addThumbnailJob(
    data: Omit<GenerateThumbnailJobData, 'type'>
  ): Promise<Job<PdfJobData>> {
    return this.queue.add(
      PdfJobType.GENERATE_THUMBNAIL,
      {
        type: PdfJobType.GENERATE_THUMBNAIL,
        ...data,
      },
      {
        priority: 5, // Medium priority
        attempts: 2,
      }
    );
  }

  /**
   * Add PDF optimization job
   */
  async addOptimizationJob(
    data: Omit<OptimizePdfJobData, 'type'>
  ): Promise<Job<PdfJobData>> {
    return this.queue.add(
      PdfJobType.OPTIMIZE_PDF,
      {
        type: PdfJobType.OPTIMIZE_PDF,
        ...data,
      },
      {
        priority: 3, // Lower priority
        attempts: 2,
      }
    );
  }

  /**
   * Add PDF flattening job
   */
  async addFlattenJob(
    data: Omit<FlattenPdfJobData, 'type'>
  ): Promise<Job<PdfJobData>> {
    return this.queue.add(
      PdfJobType.FLATTEN_PDF,
      {
        type: PdfJobType.FLATTEN_PDF,
        ...data,
      },
      {
        priority: 5,
        attempts: 2,
      }
    );
  }

  /**
   * Add watermark job
   */
  async addWatermarkJob(
    data: Omit<AddWatermarkJobData, 'type'>
  ): Promise<Job<PdfJobData>> {
    return this.queue.add(
      PdfJobType.ADD_WATERMARK,
      {
        type: PdfJobType.ADD_WATERMARK,
        ...data,
      },
      {
        priority: 5,
        attempts: 2,
      }
    );
  }

  /**
   * Add PDF merge job
   */
  async addMergeJob(
    data: Omit<MergePdfsJobData, 'type'>
  ): Promise<Job<PdfJobData>> {
    return this.queue.add(
      PdfJobType.MERGE_PDFS,
      {
        type: PdfJobType.MERGE_PDFS,
        ...data,
      },
      {
        priority: 7, // Higher priority for merge
        attempts: 2,
      }
    );
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job<PdfJobData> | undefined> {
    return this.queue.getJob(jobId);
  }

  /**
   * Get detailed job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    status: string;
    progress: number;
    result?: any;
    error?: string;
    createdAt?: Date;
    processedAt?: Date;
    finishedAt?: Date;
  } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
      id: job.id!,
      status: state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue,
      error: job.failedReason,
      createdAt: job.timestamp ? new Date(job.timestamp) : undefined,
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Close queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}

// Export singleton instance
export const pdfQueueService = new PdfQueueService();
