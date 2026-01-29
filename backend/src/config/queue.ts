import { Queue, Worker, QueueOptions, WorkerOptions, Job } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';

/**
 * Redis connection configuration
 */
export const getRedisConnection = (): Redis => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
  });
};

/**
 * Default queue options
 */
export const defaultQueueOptions: QueueOptions = {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 86400, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs
      age: 604800, // Keep for 7 days
    },
  },
};

/**
 * Default worker options
 */
export const defaultWorkerOptions: Omit<WorkerOptions, 'connection'> = {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
  // Allow workers to complete current jobs during graceful shutdown
  // drainDelay waits for this many ms before considering the worker drained
  drainDelay: 5000,
};

/**
 * Queue names
 */
export enum QueueName {
  EMAIL = 'email',
  PDF_PROCESSING = 'pdf-processing',
  WEBHOOK_DELIVERY = 'webhook-delivery',
  CLEANUP = 'cleanup',
  SCHEDULED_SEND = 'scheduled-send',
  DEADLINE_REMINDERS = 'deadline-reminders',
}

/**
 * Job timeout configuration per queue (in milliseconds)
 * These define the maximum time a job can run before being considered stalled
 */
export const JOB_TIMEOUTS: Record<QueueName, number> = {
  [QueueName.EMAIL]: 30000, // 30 seconds - email sends should be quick
  [QueueName.PDF_PROCESSING]: 300000, // 5 minutes - PDF processing can take time
  [QueueName.WEBHOOK_DELIVERY]: 30000, // 30 seconds - webhook calls should timeout
  [QueueName.CLEANUP]: 600000, // 10 minutes - cleanup can process many files
  [QueueName.SCHEDULED_SEND]: 60000, // 1 minute - scheduling should be fast
  [QueueName.DEADLINE_REMINDERS]: 60000, // 1 minute - sending reminders
};

/**
 * Lock duration per queue (in milliseconds)
 * This is how long the worker has exclusive access to process the job
 * Should be slightly longer than the expected processing time
 */
export const LOCK_DURATIONS: Record<QueueName, number> = {
  [QueueName.EMAIL]: 45000, // 45 seconds
  [QueueName.PDF_PROCESSING]: 360000, // 6 minutes
  [QueueName.WEBHOOK_DELIVERY]: 45000, // 45 seconds
  [QueueName.CLEANUP]: 720000, // 12 minutes
  [QueueName.SCHEDULED_SEND]: 90000, // 90 seconds
  [QueueName.DEADLINE_REMINDERS]: 90000, // 90 seconds
};

/**
 * Stalled job check interval per queue (in milliseconds)
 * How often to check for stalled jobs that exceeded their lock duration
 */
export const STALLED_CHECK_INTERVALS: Record<QueueName, number> = {
  [QueueName.EMAIL]: 15000, // 15 seconds
  [QueueName.PDF_PROCESSING]: 60000, // 1 minute
  [QueueName.WEBHOOK_DELIVERY]: 15000, // 15 seconds
  [QueueName.CLEANUP]: 120000, // 2 minutes
  [QueueName.SCHEDULED_SEND]: 30000, // 30 seconds
  [QueueName.DEADLINE_REMINDERS]: 30000, // 30 seconds
};

/**
 * Get timeout configuration for a specific queue
 */
export const getQueueTimeoutConfig = (
  queueName: QueueName
): {
  timeout: number;
  lockDuration: number;
  stalledInterval: number;
} => {
  return {
    timeout: JOB_TIMEOUTS[queueName],
    lockDuration: LOCK_DURATIONS[queueName],
    stalledInterval: STALLED_CHECK_INTERVALS[queueName],
  };
};

/**
 * Create a queue instance
 */
export const createQueue = (name: QueueName): Queue => {
  return new Queue(name, defaultQueueOptions);
};

/**
 * Create a worker instance with timeout configuration
 */
export const createWorker = <T = unknown>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<unknown>,
  options?: Partial<WorkerOptions>
): Worker<T> => {
  const timeoutConfig = getQueueTimeoutConfig(name);

  return new Worker<T>(
    name,
    processor,
    {
      ...defaultWorkerOptions,
      // Apply timeout configuration
      lockDuration: timeoutConfig.lockDuration,
      stalledInterval: timeoutConfig.stalledInterval,
      ...options,
      connection: getRedisConnection(),
    } as WorkerOptions
  );
};

/**
 * Gracefully close all queue connections
 */
export const closeQueueConnections = async (
  queues: Queue[],
  workers: Worker[]
): Promise<void> => {
  await Promise.all([
    ...queues.map((q) => q.close()),
    ...workers.map((w) => w.close()),
  ]);
};

/**
 * Check if a job has exhausted all retries and should be moved to DLQ
 */
export const shouldMoveToDeadLetterQueue = (job: Job): boolean => {
  const maxAttempts = job.opts?.attempts || 3;
  return job.attemptsMade >= maxAttempts;
};

/**
 * Move a failed job to the Dead Letter Queue
 * This is called from workers when a job fails its final attempt
 */
export const moveToDeadLetterQueue = async (
  pool: Pool,
  job: Job,
  error: Error,
  queueName: QueueName
): Promise<void> => {
  // Dynamically import to avoid circular dependencies
  const { DeadLetterQueueService } = await import('@/services/deadLetterQueueService');
  const dlqService = new DeadLetterQueueService(pool);

  await dlqService.addFailedJob(job, error, queueName);
};
