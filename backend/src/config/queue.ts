import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import Redis from 'ioredis';

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
 * Create a queue instance
 */
export const createQueue = (name: QueueName): Queue => {
  return new Queue(name, defaultQueueOptions);
};

/**
 * Create a worker instance
 */
export const createWorker = <T = any>(
  name: QueueName,
  processor: (job: any) => Promise<any>,
  options?: Partial<WorkerOptions>
): Worker<T> => {
  return new Worker<T>(
    name,
    processor,
    {
      ...defaultWorkerOptions,
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
