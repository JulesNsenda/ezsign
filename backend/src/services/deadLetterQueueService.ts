import { Pool } from 'pg';
import { Job } from 'bullmq';
import { QueueName, createQueue } from '@/config/queue';
import logger from '@/services/loggerService';

/**
 * Dead Letter Queue entry status
 */
export type DLQStatus = 'failed' | 'retrying' | 'resolved' | 'discarded';

/**
 * Dead Letter Queue entry data
 */
export interface DLQEntry {
  id: string;
  queue_name: string;
  job_id: string;
  job_name: string | null;
  job_data: Record<string, unknown>;
  error_message: string | null;
  error_stack: string | null;
  attempts_made: number;
  max_attempts: number;
  failed_at: Date;
  retried_at: Date | null;
  retry_count: number;
  status: DLQStatus;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Options for adding a job to DLQ
 */
export interface AddToDLQOptions {
  queueName: string;
  jobId: string;
  jobName?: string;
  jobData: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  attemptsMade: number;
  maxAttempts: number;
  metadata?: Record<string, unknown>;
}

/**
 * Filter options for listing DLQ entries
 */
export interface DLQListOptions {
  queueName?: string;
  status?: DLQStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'failed_at' | 'created_at' | 'retry_count';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Statistics for DLQ
 */
export interface DLQStats {
  total: number;
  byStatus: Record<DLQStatus, number>;
  byQueue: Record<string, number>;
  oldestFailedAt: Date | null;
  newestFailedAt: Date | null;
}

/**
 * Dead Letter Queue Service
 * Manages failed jobs for inspection and retry
 */
export class DeadLetterQueueService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Add a failed job to the Dead Letter Queue
   */
  async addToDLQ(options: AddToDLQOptions): Promise<DLQEntry> {
    const query = `
      INSERT INTO dead_letter_queue (
        queue_name, job_id, job_name, job_data, error_message, error_stack,
        attempts_made, max_attempts, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      options.queueName,
      options.jobId,
      options.jobName || null,
      JSON.stringify(options.jobData),
      options.errorMessage || null,
      options.errorStack || null,
      options.attemptsMade,
      options.maxAttempts,
      options.metadata ? JSON.stringify(options.metadata) : null,
    ];

    const result = await this.pool.query<DLQEntry>(query, values);
    const entry = result.rows[0];

    if (!entry) {
      throw new Error('Failed to add job to Dead Letter Queue');
    }

    logger.info('Job added to Dead Letter Queue', {
      dlqId: entry.id,
      queueName: options.queueName,
      jobId: options.jobId,
      errorMessage: options.errorMessage,
    });

    return entry;
  }

  /**
   * Add a failed BullMQ job to the DLQ
   */
  async addFailedJob(
    job: Job,
    error: Error,
    queueName: string
  ): Promise<DLQEntry> {
    return this.addToDLQ({
      queueName,
      jobId: job.id || 'unknown',
      jobName: job.name,
      jobData: job.data as Record<string, unknown>,
      errorMessage: error.message,
      errorStack: error.stack,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts?.attempts || 3,
      metadata: {
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        opts: job.opts,
      },
    });
  }

  /**
   * Get a DLQ entry by ID
   */
  async getById(id: string): Promise<DLQEntry | null> {
    const query = `SELECT * FROM dead_letter_queue WHERE id = $1`;
    const result = await this.pool.query<DLQEntry>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * List DLQ entries with filtering and pagination
   */
  async list(options: DLQListOptions = {}): Promise<{
    entries: DLQEntry[];
    total: number;
  }> {
    const {
      queueName,
      status,
      limit = 50,
      offset = 0,
      sortBy = 'failed_at',
      sortOrder = 'desc',
    } = options;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (queueName) {
      conditions.push(`queue_name = $${paramCount++}`);
      values.push(queueName);
    }

    if (status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM dead_letter_queue ${whereClause}`;
    const countResult = await this.pool.query<{ count: string }>(countQuery, values);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get entries
    const query = `
      SELECT * FROM dead_letter_queue
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramCount++} OFFSET $${paramCount}
    `;

    const result = await this.pool.query<DLQEntry>(query, [...values, limit, offset]);

    return {
      entries: result.rows,
      total,
    };
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE status = 'retrying') as retrying_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'discarded') as discarded_count,
        MIN(failed_at) FILTER (WHERE status = 'failed') as oldest_failed_at,
        MAX(failed_at) FILTER (WHERE status = 'failed') as newest_failed_at
      FROM dead_letter_queue
    `;

    const queueStatsQuery = `
      SELECT queue_name, COUNT(*) as count
      FROM dead_letter_queue
      WHERE status = 'failed'
      GROUP BY queue_name
    `;

    const [statsResult, queueStatsResult] = await Promise.all([
      this.pool.query(statsQuery),
      this.pool.query<{ queue_name: string; count: string }>(queueStatsQuery),
    ]);

    const stats = statsResult.rows[0];
    const byQueue: Record<string, number> = {};

    for (const row of queueStatsResult.rows) {
      byQueue[row.queue_name] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(stats.total, 10),
      byStatus: {
        failed: parseInt(stats.failed_count, 10),
        retrying: parseInt(stats.retrying_count, 10),
        resolved: parseInt(stats.resolved_count, 10),
        discarded: parseInt(stats.discarded_count, 10),
      },
      byQueue,
      oldestFailedAt: stats.oldest_failed_at,
      newestFailedAt: stats.newest_failed_at,
    };
  }

  /**
   * Retry a failed job by re-queuing it
   */
  async retryJob(id: string): Promise<{ success: boolean; newJobId?: string; error?: string }> {
    const entry = await this.getById(id);

    if (!entry) {
      return { success: false, error: 'DLQ entry not found' };
    }

    if (entry.status !== 'failed') {
      return { success: false, error: `Cannot retry job with status: ${entry.status}` };
    }

    try {
      // Update status to retrying
      await this.updateStatus(id, 'retrying');

      // Get the appropriate queue
      const queueName = entry.queue_name as QueueName;
      const queue = createQueue(queueName);

      // Add job back to the queue
      const job = await queue.add(entry.job_name || 'retried-job', entry.job_data, {
        attempts: entry.max_attempts,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });

      // Update DLQ entry
      await this.pool.query(
        `UPDATE dead_letter_queue
         SET retried_at = CURRENT_TIMESTAMP,
             retry_count = retry_count + 1,
             status = 'resolved',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );

      logger.info('Job retried from DLQ', {
        dlqId: id,
        newJobId: job.id,
        queueName: entry.queue_name,
      });

      // Close the queue connection
      await queue.close();

      return { success: true, newJobId: job.id };
    } catch (error) {
      // Revert status on failure
      await this.updateStatus(id, 'failed');

      logger.error('Failed to retry job from DLQ', {
        dlqId: id,
        error: (error as Error).message,
      });

      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Retry multiple failed jobs
   */
  async retryBatch(ids: string[]): Promise<{
    succeeded: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      const result = await this.retryJob(id);
      if (result.success) {
        succeeded.push(id);
      } else {
        failed.push({ id, error: result.error || 'Unknown error' });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Discard a failed job (mark it as resolved without retrying)
   */
  async discardJob(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE dead_letter_queue
       SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'failed'
       RETURNING id`,
      [id]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Job discarded from DLQ', { dlqId: id });
      return true;
    }

    return false;
  }

  /**
   * Discard multiple jobs
   */
  async discardBatch(ids: string[]): Promise<number> {
    const result = await this.pool.query(
      `UPDATE dead_letter_queue
       SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1) AND status = 'failed'`,
      [ids]
    );

    logger.info('Jobs discarded from DLQ', { count: result.rowCount, ids });
    return result.rowCount || 0;
  }

  /**
   * Update the status of a DLQ entry
   */
  async updateStatus(id: string, status: DLQStatus): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE dead_letter_queue
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id`,
      [status, id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete old resolved/discarded entries (cleanup)
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM dead_letter_queue
       WHERE status IN ('resolved', 'discarded')
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * $1`,
      [olderThanDays]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Cleaned up old DLQ entries', { count: result.rowCount, olderThanDays });
    }

    return result.rowCount || 0;
  }

  /**
   * Get available queue names for filtering
   */
  async getQueueNames(): Promise<string[]> {
    const result = await this.pool.query<{ queue_name: string }>(
      `SELECT DISTINCT queue_name FROM dead_letter_queue ORDER BY queue_name`
    );

    return result.rows.map((row) => row.queue_name);
  }
}

/**
 * Create DLQ service instance
 */
export const createDeadLetterQueueService = (pool: Pool): DeadLetterQueueService => {
  return new DeadLetterQueueService(pool);
};
