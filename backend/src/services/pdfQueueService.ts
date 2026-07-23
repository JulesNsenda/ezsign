import { enqueue, findJob, getQueueStats, QueueName } from '@/config/queue';

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
 * Legacy (BullMQ-era) job status shape, kept stable for API clients of
 * `GET /api/pdf/jobs/:jobId`. Populated from pg-boss's `findJob` per decision
 * 11 of docs/plans/2026-07-22-remove-redis-postgres-only-r2.md:
 *  - `status` is the pg-boss job state mapped to the old BullMQ name:
 *    created->waiting, retry->delayed, active->active, completed->completed,
 *    failed/cancelled->failed.
 *  - `progress` is always `null` now - BullMQ's `job.updateProgress` has no
 *    pg-boss analog and was removed from the worker (accepted regression;
 *    field kept in the shape rather than dropped, for API stability).
 *  - `result` is pg-boss's `output` on a completed job.
 *  - `error` is derived from pg-boss's `output` on a failed/cancelled job -
 *    pg-boss stores the thrown Error, serialized via `serialize-error`, as
 *    `output`, so `output.message` is the common case.
 */
export interface PdfJobStatus {
  id: string;
  status: string;
  progress: number | null;
  result?: unknown;
  error?: string;
  createdAt?: Date;
  processedAt?: Date;
  finishedAt?: Date;
}

/**
 * Queue metrics shape. NOTE (decision 11): the BullMQ-era `completed` count
 * is gone - pg-boss's `getQueueStats` has no equivalent (it does not track a
 * running total of completed jobs). Callers that relied on `completed` must
 * adapt.
 */
export interface PdfQueueMetrics {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

const PG_BOSS_STATE_TO_LEGACY_STATUS: Record<string, string> = {
  created: 'waiting',
  retry: 'delayed',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
};

/**
 * Extract a human-readable message from pg-boss's `output` field on a
 * failed/cancelled job. pg-boss serializes the thrown Error via
 * `serialize-error` before persisting it as `output`, so `.message` is the
 * common case; fall back to a JSON dump for anything else (e.g. a job
 * cancelled with no error attached).
 */
function extractErrorMessage(output: unknown): string | undefined {
  if (
    output &&
    typeof output === 'object' &&
    'message' in output &&
    typeof (output as { message: unknown }).message === 'string'
  ) {
    return (output as { message: string }).message;
  }
  return output ? JSON.stringify(output) : undefined;
}

/** Decision 9: `attempts: 2` (BullMQ) -> `retryLimit: 1` (pg-boss), off-by-one. */
const DEFAULT_RETRY_LIMIT = 1;

/**
 * PDF Processing Queue Service
 * Enqueues PDF processing jobs on pg-boss's `pdf-processing` queue.
 *
 * Lazy by construction (decision 6): this module touches nothing
 * queue-related at import time. Every method calls into `@/config/queue`'s
 * `enqueue`/`findJob`/`getQueueStats`, which throw if `startQueues()` has
 * not run yet - there is no eagerly-constructed `Queue` instance held here
 * anymore (that was the BullMQ-era `this.queue = createQueue(...)` in the
 * constructor).
 */
export class PdfQueueService {
  /**
   * Add thumbnail generation job. Returns the pg-boss job UUID, or `null` if
   * a `singletonKey` dedupe suppressed the send (not used here, so this is
   * effectively always a UUID).
   */
  async addThumbnailJob(data: Omit<GenerateThumbnailJobData, 'type'>): Promise<string | null> {
    return enqueue(
      QueueName.PDF_PROCESSING,
      { type: PdfJobType.GENERATE_THUMBNAIL, ...data },
      {
        priority: 5, // Medium priority
        retryLimit: DEFAULT_RETRY_LIMIT,
      }
    );
  }

  /**
   * Add PDF optimization job
   */
  async addOptimizationJob(data: Omit<OptimizePdfJobData, 'type'>): Promise<string | null> {
    return enqueue(
      QueueName.PDF_PROCESSING,
      { type: PdfJobType.OPTIMIZE_PDF, ...data },
      {
        priority: 3, // Lower priority
        retryLimit: DEFAULT_RETRY_LIMIT,
      }
    );
  }

  /**
   * Add PDF flattening job
   */
  async addFlattenJob(data: Omit<FlattenPdfJobData, 'type'>): Promise<string | null> {
    return enqueue(
      QueueName.PDF_PROCESSING,
      { type: PdfJobType.FLATTEN_PDF, ...data },
      {
        priority: 5,
        retryLimit: DEFAULT_RETRY_LIMIT,
      }
    );
  }

  /**
   * Add watermark job
   */
  async addWatermarkJob(data: Omit<AddWatermarkJobData, 'type'>): Promise<string | null> {
    return enqueue(
      QueueName.PDF_PROCESSING,
      { type: PdfJobType.ADD_WATERMARK, ...data },
      {
        priority: 5,
        retryLimit: DEFAULT_RETRY_LIMIT,
      }
    );
  }

  /**
   * Add PDF merge job
   */
  async addMergeJob(data: Omit<MergePdfsJobData, 'type'>): Promise<string | null> {
    return enqueue(
      QueueName.PDF_PROCESSING,
      { type: PdfJobType.MERGE_PDFS, ...data },
      {
        priority: 7, // Higher priority for merge
        retryLimit: DEFAULT_RETRY_LIMIT,
      }
    );
  }

  /**
   * Get detailed job status. Returns `null` if the job doesn't exist
   * (including if it aged out of pg-boss's 7-day retention window -
   * decision 10).
   */
  async getJobStatus(jobId: string): Promise<PdfJobStatus | null> {
    const job = await findJob(QueueName.PDF_PROCESSING, jobId);
    if (!job) return null;

    const isCompleted = job.state === 'completed';
    const isFailure = job.state === 'failed' || job.state === 'cancelled';

    return {
      id: job.id,
      status: PG_BOSS_STATE_TO_LEGACY_STATUS[job.state] ?? job.state,
      progress: null, // decision 11: no pg-boss analog for job.updateProgress
      result: isCompleted ? job.output : undefined,
      error: isFailure ? extractErrorMessage(job.output) : undefined,
      createdAt: job.createdOn ? new Date(job.createdOn) : undefined,
      processedAt: job.startedOn ? new Date(job.startedOn) : undefined,
      finishedAt: job.completedOn ? new Date(job.completedOn) : undefined,
    };
  }

  /**
   * Get queue metrics.
   *
   * Mapping from pg-boss's `QueueStats` (decision 11 - no `completed` count
   * equivalent exists, so it is dropped from the response rather than
   * faked):
   *  - `waiting` <- `readyCount` (queued and runnable now)
   *  - `delayed` <- `deferredCount` (queued with a future `startAfter`) -
   *    together `readyCount + deferredCount` covers what BullMQ's combined
   *    "waiting" queued-count used to represent.
   *  - `active`  <- `activeCount`
   *  - `failed`  <- `failedCount`
   */
  async getMetrics(): Promise<PdfQueueMetrics> {
    const [stats] = await getQueueStats(QueueName.PDF_PROCESSING);

    return {
      waiting: stats?.readyCount ?? 0,
      active: stats?.activeCount ?? 0,
      failed: stats?.failedCount ?? 0,
      delayed: stats?.deferredCount ?? 0,
    };
  }
}

// Export singleton instance
export const pdfQueueService = new PdfQueueService();
