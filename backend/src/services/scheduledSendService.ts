import { Queue, Job } from 'bullmq';
import { Pool } from 'pg';
import { createQueue, QueueName } from '@/config/queue';
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
 * Scheduled Send Service
 * Manages scheduled document sending with BullMQ delayed jobs
 */
export class ScheduledSendService {
  private queue: Queue<ScheduledSendJobData>;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.queue = createQueue(QueueName.SCHEDULED_SEND);
  }

  /**
   * Schedule a document to be sent at a specific time
   */
  async scheduleDocumentSend(
    documentId: string,
    userId: string,
    sendAt: Date,
    timezone: string
  ): Promise<{ jobId: string }> {
    const delay = sendAt.getTime() - Date.now();

    if (delay <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    // Create unique job ID for this document
    const jobId = `scheduled-send-${documentId}`;

    // Remove any existing scheduled job for this document
    const existingJob = await Job.fromId(this.queue, jobId);
    if (existingJob) {
      await existingJob.remove();
      logger.info('Removed existing scheduled job', { documentId, jobId });
    }

    // Create delayed job
    const job = await this.queue.add(
      'send-document',
      {
        documentId,
        scheduledAt: sendAt.toISOString(),
        timezone,
        userId,
      },
      {
        delay,
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute initial delay on failure
        },
      }
    );

    // Update document status in database
    await this.pool.query(
      `UPDATE documents
       SET status = 'scheduled',
           scheduled_send_at = $1,
           scheduled_timezone = $2,
           schedule_job_id = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [sendAt, timezone, job.id, documentId]
    );

    logger.info('Document scheduled for sending', {
      documentId,
      jobId: job.id,
      scheduledAt: sendAt.toISOString(),
      timezone,
      delayMs: delay,
    });

    return { jobId: job.id! };
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
      // Remove the job from queue
      const job = await Job.fromId(this.queue, jobId);
      if (job) {
        await job.remove();
        logger.info('Scheduled job removed', { documentId, jobId });
      }
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

  /**
   * Get the queue instance (for worker use)
   */
  getQueue(): Queue<ScheduledSendJobData> {
    return this.queue;
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}

// Factory function to create service instance
export const createScheduledSendService = (pool: Pool): ScheduledSendService => {
  return new ScheduledSendService(pool);
};
