import { Job } from 'bullmq';
import { Pool } from 'pg';
import { createWorker, QueueName, shouldMoveToDeadLetterQueue, moveToDeadLetterQueue } from '@/config/queue';
import { WebhookDeliveryService } from '@/services/webhookDeliveryService';
import logger from '@/services/loggerService';

/**
 * Webhook job data structure
 */
export interface WebhookJobData {
  eventId: string;
}

/**
 * Webhook Worker
 * Processes webhook delivery jobs from the queue
 */
export class WebhookWorker {
  private worker;
  private webhookDeliveryService: WebhookDeliveryService;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.webhookDeliveryService = new WebhookDeliveryService(pool);

    this.worker = createWorker<WebhookJobData>(
      QueueName.WEBHOOK_DELIVERY,
      this.processJob.bind(this),
      {
        concurrency: 10, // Process 10 webhook deliveries concurrently
        limiter: {
          max: 100, // Max 100 requests per second
          duration: 1000,
        },
      }
    );

    this.setupEventListeners();
  }

  /**
   * Process webhook delivery job
   */
  private async processJob(job: Job<WebhookJobData>): Promise<void> {
    logger.debug('Processing webhook delivery job', { jobId: job.id, eventId: job.data.eventId });

    try {
      await job.updateProgress(10);

      // Process the webhook event
      await this.webhookDeliveryService.processWebhookEvent(job.data.eventId);

      await job.updateProgress(100);
      logger.debug('Webhook delivery job completed', { jobId: job.id });
    } catch (error) {
      logger.error('Webhook delivery job failed', { jobId: job.id, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Set up event listeners for the worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<WebhookJobData>) => {
      logger.debug('Webhook delivery job completed successfully', { jobId: job.id });
    });

    this.worker.on('failed', async (job: Job<WebhookJobData> | undefined, error: Error) => {
      if (job) {
        logger.error('Webhook delivery job failed', {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          error: error.message,
        });

        // Move to Dead Letter Queue after all retries exhausted
        if (shouldMoveToDeadLetterQueue(job)) {
          try {
            await moveToDeadLetterQueue(this.pool, job, error, QueueName.WEBHOOK_DELIVERY);
            logger.info('Webhook job moved to Dead Letter Queue', { jobId: job.id });
          } catch (dlqError) {
            logger.error('Failed to move webhook job to DLQ', {
              jobId: job.id,
              error: (dlqError as Error).message,
            });
          }
        }
      } else {
        logger.error('Webhook delivery job failed (job undefined)', { error: error.message });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Webhook worker error', { error: error.message, stack: error.stack });
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn('Webhook job stalled (timeout exceeded)', {
        jobId,
        queueName: QueueName.WEBHOOK_DELIVERY,
      });
    });

    this.worker.on('active', (job: Job<WebhookJobData>) => {
      logger.debug('Webhook delivery job started', { jobId: job.id, eventId: job.data.eventId });
    });

    this.worker.on('progress', (job: Job<WebhookJobData>, progress) => {
      logger.debug('Webhook delivery job progress', { jobId: job.id, progress });
    });
  }

  /**
   * Close worker connection
   */
  async close(): Promise<void> {
    logger.info('Closing webhook worker...');
    await this.worker.close();
    logger.info('Webhook worker closed');
  }
}

/**
 * Create webhook worker instance
 * Must be called with pool instance
 */
export const createWebhookWorker = (pool: Pool): WebhookWorker => {
  return new WebhookWorker(pool);
};
