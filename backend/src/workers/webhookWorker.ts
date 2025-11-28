import { Job } from 'bullmq';
import { Pool } from 'pg';
import { createWorker, QueueName } from '@/config/queue';
import { WebhookDeliveryService } from '@/services/webhookDeliveryService';

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

  constructor(pool: Pool) {
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
    console.log(`Processing webhook delivery job ${job.id} for event ${job.data.eventId}`);

    try {
      await job.updateProgress(10);

      // Process the webhook event
      await this.webhookDeliveryService.processWebhookEvent(job.data.eventId);

      await job.updateProgress(100);
      console.log(`✓ Webhook delivery job ${job.id} completed`);
    } catch (error) {
      console.error(`✗ Webhook delivery job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Set up event listeners for the worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<WebhookJobData>) => {
      console.log(`✓ Webhook delivery job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job: Job<WebhookJobData> | undefined, error: Error) => {
      if (job) {
        console.error(`✗ Webhook delivery job ${job.id} failed:`, error.message);
      } else {
        console.error('✗ Webhook delivery job failed (job undefined):', error.message);
      }
    });

    this.worker.on('error', (error: Error) => {
      console.error('✗ Webhook worker error:', error);
    });

    this.worker.on('active', (job: Job<WebhookJobData>) => {
      console.log(`⏳ Webhook delivery job ${job.id} started for event ${job.data.eventId}`);
    });

    this.worker.on('progress', (job: Job<WebhookJobData>, progress) => {
      console.log(`⏳ Webhook delivery job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * Close worker connection
   */
  async close(): Promise<void> {
    console.log('Closing webhook worker...');
    await this.worker.close();
    console.log('Webhook worker closed');
  }
}

/**
 * Create webhook worker instance
 * Must be called with pool instance
 */
export const createWebhookWorker = (pool: Pool): WebhookWorker => {
  return new WebhookWorker(pool);
};
