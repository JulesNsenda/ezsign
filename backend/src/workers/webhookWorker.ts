import { Pool } from 'pg';
import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { WebhookDeliveryService } from '@/services/webhookDeliveryService';
import logger from '@/services/loggerService';

/**
 * Webhook job data structure
 */
export interface WebhookJobData {
  eventId: string;
}

/**
 * Create the webhook worker.
 *
 * Registers a pg-boss handler for the WEBHOOK_DELIVERY queue. Final-failure
 * Dead Letter Queue writes are handled centrally by `registerWorker` in
 * config/queue.ts (see its CONTRACT comment) - this handler must not
 * duplicate that logic, it only needs to process the job and rethrow on
 * failure so pg-boss can retry/fail it.
 *
 * NOTE: the old BullMQ limiter (100 req/s cap on this queue) has no pg-boss
 * analog and is deliberately dropped (plan decision 11); `localConcurrency`
 * below is the coarse replacement ceiling.
 */
export const createWebhookWorker = async (pool: Pool): Promise<void> => {
  const webhookDeliveryService = new WebhookDeliveryService(pool);

  await registerWorker(
    QueueName.WEBHOOK_DELIVERY,
    async (job: NormalizedJob): Promise<void> => {
      const { eventId } = job.data as WebhookJobData;

      logger.debug('Processing webhook delivery job', { jobId: job.id, eventId });

      try {
        await webhookDeliveryService.processWebhookEvent(eventId);
        logger.debug('Webhook delivery job completed', { jobId: job.id });
      } catch (error) {
        logger.error('Webhook delivery job failed', { jobId: job.id, error: (error as Error).message });
        throw error;
      }
    },
    { localConcurrency: 10 }, // Process 10 webhook deliveries concurrently
  );
};
