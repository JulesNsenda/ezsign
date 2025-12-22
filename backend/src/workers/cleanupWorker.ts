import { Job, Worker, Queue } from 'bullmq';
import { Pool } from 'pg';
import { getRedisConnection, QueueName } from '@/config/queue';
import { CleanupService } from '@/services/cleanupService';
import logger from '@/services/loggerService';

/**
 * Cleanup job types
 */
export enum CleanupJobType {
  TEMP_FILES = 'temp_files',
  ORPHANED_DOCUMENTS = 'orphaned_documents',
  ORPHANED_SIGNATURES = 'orphaned_signatures',
  FULL_CLEANUP = 'full_cleanup',
}

/**
 * Cleanup job data interface
 */
export interface CleanupJobData {
  type: CleanupJobType;
  maxAgeHours?: number;
}

/**
 * Create and return the cleanup worker
 */
export const createCleanupWorker = (pool: Pool): Worker<CleanupJobData> => {
  const cleanupService = new CleanupService(pool);

  const worker = new Worker<CleanupJobData>(
    QueueName.CLEANUP,
    async (job: Job<CleanupJobData>) => {
      const { type, maxAgeHours } = job.data;

      logger.info('Processing cleanup job', { jobId: job.id, type, maxAgeHours });

      try {
        switch (type) {
          case CleanupJobType.TEMP_FILES:
            return await cleanupService.cleanupTempFiles(maxAgeHours ?? 24);

          case CleanupJobType.ORPHANED_DOCUMENTS:
            return await cleanupService.cleanupOrphanedDocumentFiles();

          case CleanupJobType.ORPHANED_SIGNATURES:
            return await cleanupService.cleanupOrphanedSignatures();

          case CleanupJobType.FULL_CLEANUP:
            return await cleanupService.runFullCleanup(maxAgeHours ?? 24);

          default:
            throw new Error(`Unknown cleanup job type: ${type}`);
        }
      } catch (error) {
        logger.error('Cleanup job failed', {
          jobId: job.id,
          type,
          error: (error as Error).message,
        });
        throw error;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // Run one cleanup at a time to avoid conflicts
    }
  );

  worker.on('completed', (job, result) => {
    logger.info('Cleanup job completed', {
      jobId: job.id,
      type: job.data.type,
      result,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('Cleanup job failed', {
      jobId: job?.id,
      type: job?.data.type,
      error: err.message,
    });
  });

  return worker;
};

/**
 * Create the cleanup queue
 */
export const createCleanupQueue = (): Queue<CleanupJobData> => {
  return new Queue<CleanupJobData>(QueueName.CLEANUP, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: {
        count: 50,
        age: 86400, // 24 hours
      },
      removeOnFail: {
        count: 100,
        age: 604800, // 7 days
      },
    },
  });
};

/**
 * Schedule recurring cleanup jobs
 */
export const scheduleCleanupJobs = async (queue: Queue<CleanupJobData>): Promise<void> => {
  logger.info('Scheduling cleanup jobs');

  // Remove existing repeatable jobs to avoid duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule full cleanup daily at 3 AM
  await queue.add(
    'daily-full-cleanup',
    { type: CleanupJobType.FULL_CLEANUP, maxAgeHours: 24 },
    {
      repeat: {
        pattern: '0 3 * * *', // 3 AM every day
      },
    }
  );

  // Schedule temp file cleanup every 6 hours
  await queue.add(
    'temp-cleanup-6h',
    { type: CleanupJobType.TEMP_FILES, maxAgeHours: 6 },
    {
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
    }
  );

  logger.info('Cleanup jobs scheduled', {
    dailyFullCleanup: '3 AM daily',
    tempCleanup: 'Every 6 hours',
  });
};

/**
 * Trigger an immediate cleanup job
 */
export const triggerCleanup = async (
  queue: Queue<CleanupJobData>,
  type: CleanupJobType,
  maxAgeHours?: number
): Promise<Job<CleanupJobData>> => {
  return queue.add(
    `manual-${type}-${Date.now()}`,
    { type, maxAgeHours },
    { priority: 1 } // Higher priority for manual triggers
  );
};
