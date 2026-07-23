import { Pool } from 'pg';
import { enqueue, cancelJob, QueueName } from '@/config/queue';
import logger from '@/services/loggerService';

/**
 * Scheduled send job data
 */
export interface ScheduledSendJobData {
  documentId: string;
  scheduledAt: string;
  timezone: string;
  userId: string;
}

/**
 * Per-job retry override for the scheduled-send queue (decision 9: BullMQ's
 * `attempts: 3` -> pg-boss `retryLimit: 2`, off-by-one; the original code
 * also set an explicit 60s initial backoff delay here, overriding the
 * queue-level default set in `startQueues`).
 */
const SCHEDULED_SEND_RETRY_LIMIT = 2;
const SCHEDULED_SEND_RETRY_DELAY_SECONDS = 60;

/**
 * Scheduled Send Service
 * Manages scheduled document sending via pg-boss delayed jobs.
 *
 * pg-boss job ids are server-generated UUIDs (decision 8) - there is no
 * BullMQ-style deterministic `jobId` to reuse. Instead this service:
 *  - dedupes per document via `singletonKey: 'scheduled-send-' + documentId`
 *  - persists the pg-boss-returned UUID into `documents.schedule_job_id` so
 *    a later reschedule/cancel can address the exact job by id
 */
export class ScheduledSendService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private singletonKeyFor(documentId: string): string {
    return `scheduled-send-${documentId}`;
  }

  /**
   * Cancel a pg-boss job by id, tolerating the cases where there is nothing
   * left to cancel: the job no longer exists, or it already reached a
   * terminal state (completed/failed/cancelled) - pg-boss's own `cancel`
   * only touches non-terminal rows and silently no-ops otherwise, but a
   * stale/malformed id (e.g. a leftover BullMQ-era value from before this
   * migration) can still throw at the DB layer, so this is a real try/catch,
   * not just documentation.
   */
  private async cancelJobTolerant(jobId: string, documentId: string): Promise<void> {
    try {
      await cancelJob(QueueName.SCHEDULED_SEND, jobId);
    } catch (error) {
      logger.debug('Scheduled send cancelJob no-op (job missing, terminal, or stale id)', {
        documentId,
        jobId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Enqueue the scheduled-send job, resolving a `singletonKey` conflict once
   * if the caller's stale job (persisted from a previous schedule call)
   * hadn't finished being cancelled yet. `enqueue` returns `null` when
   * pg-boss's singletonKey dedupe suppresses the send (decision 8).
   */
  private async enqueueWithConflictRetry(
    documentId: string,
    data: ScheduledSendJobData,
    sendAt: Date,
    singletonKey: string,
    staleJobId: string | undefined
  ): Promise<string> {
    const options = {
      startAfter: sendAt,
      singletonKey,
      retryLimit: SCHEDULED_SEND_RETRY_LIMIT,
      retryDelay: SCHEDULED_SEND_RETRY_DELAY_SECONDS,
    };

    const firstAttempt = await enqueue(QueueName.SCHEDULED_SEND, data, options);
    if (firstAttempt) {
      return firstAttempt;
    }

    logger.warn('Scheduled send singletonKey conflict, retrying after cancel', {
      documentId,
      singletonKey,
      staleJobId,
    });

    if (staleJobId) {
      await this.cancelJobTolerant(staleJobId, documentId);
    }

    const retryAttempt = await enqueue(QueueName.SCHEDULED_SEND, data, options);
    if (retryAttempt) {
      return retryAttempt;
    }

    throw new Error(
      `Failed to schedule document ${documentId}: a conflicting scheduled-send job still ` +
        `holds singletonKey "${singletonKey}" after cancel-and-retry`
    );
  }

  /**
   * Schedule a document to be sent at a specific time. Also used to
   * reschedule an already-scheduled document: any previously persisted job
   * is cancelled first, then a fresh job is enqueued and its returned UUID
   * replaces the old one in `documents.schedule_job_id`.
   */
  async scheduleDocumentSend(
    documentId: string,
    userId: string,
    sendAt: Date,
    timezone: string
  ): Promise<{ jobId: string }> {
    if (sendAt.getTime() <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Cancel any existing scheduled job for this document first (reschedule
    // path). Tolerant of the job already being gone.
    const existing = await this.pool.query(
      'SELECT schedule_job_id FROM documents WHERE id = $1',
      [documentId]
    );
    const staleJobId: string | undefined = existing.rows[0]?.schedule_job_id ?? undefined;

    if (staleJobId) {
      await this.cancelJobTolerant(staleJobId, documentId);
      logger.info('Cancelled existing scheduled job before reschedule', {
        documentId,
        staleJobId,
      });
    }

    const singletonKey = this.singletonKeyFor(documentId);
    const data: ScheduledSendJobData = {
      documentId,
      scheduledAt: sendAt.toISOString(),
      timezone,
      userId,
    };

    const jobId = await this.enqueueWithConflictRetry(documentId, data, sendAt, singletonKey, staleJobId);

    // Persist the pg-boss-returned UUID (decision 8: this replaces the old
    // deterministic BullMQ jobId as the sole way to address this job later).
    await this.pool.query(
      `UPDATE documents
       SET status = 'scheduled',
           scheduled_send_at = $1,
           scheduled_timezone = $2,
           schedule_job_id = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [sendAt, timezone, jobId, documentId]
    );

    logger.info('Document scheduled for sending', {
      documentId,
      jobId,
      scheduledAt: sendAt.toISOString(),
      timezone,
    });

    return { jobId };
  }

  /**
   * Cancel a scheduled send
   */
  async cancelScheduledSend(documentId: string): Promise<void> {
    // Get the job ID from database
    const result = await this.pool.query(
      'SELECT schedule_job_id FROM documents WHERE id = $1',
      [documentId]
    );

    const jobId = result.rows[0]?.schedule_job_id;

    if (jobId) {
      await this.cancelJobTolerant(jobId, documentId);
      logger.info('Scheduled job cancelled', { documentId, jobId });
    }

    // Update document status back to draft
    await this.pool.query(
      `UPDATE documents
       SET status = 'draft',
           scheduled_send_at = NULL,
           scheduled_timezone = NULL,
           schedule_job_id = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [documentId]
    );

    logger.info('Scheduled send cancelled', { documentId });
  }

  /**
   * Get scheduled documents for a user
   */
  async getScheduledDocuments(userId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT id, title, scheduled_send_at, scheduled_timezone, created_at, updated_at
       FROM documents
       WHERE user_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_send_at ASC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get count of scheduled documents for a user
   */
  async getScheduledCount(userId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM documents
       WHERE user_id = $1 AND status = 'scheduled'`,
      [userId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Clear scheduling data after document is sent
   * Called by the worker after successful send
   */
  async clearSchedulingData(documentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE documents
       SET scheduled_send_at = NULL,
           scheduled_timezone = NULL,
           schedule_job_id = NULL
       WHERE id = $1`,
      [documentId]
    );
  }
}

// Factory function to create service instance
export const createScheduledSendService = (pool: Pool): ScheduledSendService => {
  return new ScheduledSendService(pool);
};
