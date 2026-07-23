import { Pool } from 'pg';
import { registerWorker, enqueue, QueueName, NormalizedJob } from '@/config/queue';
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
 * Create and register the cleanup worker.
 *
 * The two recurring schedules (daily full cleanup at 3 AM, temp file
 * cleanup every 6 hours) are no longer owned here - they are registered by
 * `startQueues` in config/queue.ts via `boss.schedule()`. That code's
 * payloads (`{ type: 'full_cleanup', maxAgeHours: 24 }` and
 * `{ type: 'temp_files', maxAgeHours: 6 }`) match `CleanupJobType.FULL_CLEANUP`
 * / `CleanupJobType.TEMP_FILES` exactly, so the handler below needs no
 * adaptation to consume them.
 *
 * Final-failure Dead Letter Queue writes are handled centrally by
 * `registerWorker` - this handler only needs to process the job and
 * rethrow on failure.
 */
export const createCleanupWorker = async (pool: Pool): Promise<void> => {
  const cleanupService = new CleanupService(pool);

  await registerWorker(
    QueueName.CLEANUP,
    async (job: NormalizedJob): Promise<unknown> => {
      const { type, maxAgeHours } = job.data as CleanupJobData;

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
    { localConcurrency: 1 }, // Run one cleanup at a time to avoid conflicts
  );
};

/**
 * Trigger an immediate, one-off cleanup job (e.g. from an admin endpoint).
 * The recurring schedules live in config/queue.ts's `startQueues` now; this
 * only enqueues a single manual run.
 */
export const triggerCleanup = async (
  type: CleanupJobType,
  maxAgeHours?: number,
): Promise<string | null> => {
  return enqueue(QueueName.CLEANUP, { type, maxAgeHours }, { priority: 1 });
};
