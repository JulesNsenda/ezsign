/**
 * Reminder Worker
 *
 * Processes deadline reminder jobs from the queue and sends reminder emails.
 */

import { Pool } from 'pg';
import { Worker, Job } from 'bullmq';
import { getRedisConnection, QueueName, defaultWorkerOptions, getQueueTimeoutConfig, shouldMoveToDeadLetterQueue, moveToDeadLetterQueue } from '@/config/queue';
import { createReminderService, ReminderJobData } from '@/services/reminderService';
import { EmailService, EmailConfig } from '@/services/emailService';
import { createEmailLogService } from '@/services/emailLogService';
import logger from '@/services/loggerService';

/**
 * Create the reminder worker
 */
export const createReminderWorker = (pool: Pool): Worker<ReminderJobData> => {
  // Initialize services
  const reminderService = createReminderService(pool);

  const emailUser = process.env.EMAIL_SMTP_USER || '';
  const emailPass = process.env.EMAIL_SMTP_PASS || '';

  const emailConfig: EmailConfig = {
    host: process.env.EMAIL_SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: emailUser && emailPass ? {
      user: emailUser,
      pass: emailPass,
    } : undefined,
    from: process.env.EMAIL_FROM || 'noreply@ezsign.com',
  };

  const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000';
  const emailLogService = createEmailLogService(pool);
  const emailService = new EmailService(emailConfig, baseUrl, emailLogService);

  const timeoutConfig = getQueueTimeoutConfig(QueueName.DEADLINE_REMINDERS);

  const worker = new Worker<ReminderJobData>(
    QueueName.DEADLINE_REMINDERS,
    async (job: Job<ReminderJobData>) => {
      const { documentId, signerId, reminderType, reminderId } = job.data;

      logger.info('Processing deadline reminder', {
        jobId: job.id,
        documentId,
        signerId,
        reminderType,
        reminderId,
      });

      try {
        // Verify document is still pending
        const docResult = await pool.query(
          `SELECT d.id, d.title, d.status, d.expires_at, d.user_id, u.email as owner_email, u.name as owner_name
           FROM documents d
           JOIN users u ON u.id = d.user_id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docResult.rows.length === 0) {
          logger.warn('Document not found, skipping reminder', { documentId });
          return { skipped: true, reason: 'document_not_found' };
        }

        const doc = docResult.rows[0];

        if (doc.status !== 'pending') {
          logger.info('Document no longer pending, skipping reminder', {
            documentId,
            status: doc.status,
          });
          return { skipped: true, reason: 'document_not_pending' };
        }

        // If signerId is null, this is an owner notification
        if (!signerId) {
          // TODO: Implement owner notification
          logger.info('Owner notification not yet implemented', { documentId });
          return { skipped: true, reason: 'owner_notification_not_implemented' };
        }

        // Verify signer is still pending
        const signerResult = await pool.query(
          `SELECT id, email, name, access_token, status
           FROM signers WHERE id = $1`,
          [signerId]
        );

        if (signerResult.rows.length === 0) {
          logger.warn('Signer not found, skipping reminder', { signerId });
          return { skipped: true, reason: 'signer_not_found' };
        }

        const signer = signerResult.rows[0];

        if (signer.status !== 'pending') {
          logger.info('Signer no longer pending, skipping reminder', {
            signerId,
            status: signer.status,
          });
          return { skipped: true, reason: 'signer_not_pending' };
        }

        // Calculate days remaining
        const expiresAt = new Date(doc.expires_at);
        const now = new Date();
        const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Send reminder email
        const signingUrl = emailService.generateSigningUrl(signer.access_token);

        await emailService.sendReminder({
          recipientEmail: signer.email,
          recipientName: signer.name,
          documentTitle: doc.title,
          senderName: doc.owner_name,
          signingUrl,
          daysWaiting: daysRemaining,
          documentId,
          signerId,
          userId: doc.user_id,
        });

        // Mark reminder as sent
        await reminderService.markReminderAsSent(reminderId);

        logger.info('Deadline reminder sent successfully', {
          documentId,
          signerId,
          reminderType,
          daysRemaining,
        });

        return { sent: true, daysRemaining };
      } catch (error) {
        logger.error('Failed to process deadline reminder', {
          jobId: job.id,
          documentId,
          signerId,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });

        throw error;
      }
    },
    {
      ...defaultWorkerOptions,
      connection: getRedisConnection(),
      lockDuration: timeoutConfig.lockDuration,
      stalledInterval: timeoutConfig.stalledInterval,
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.debug('Reminder job completed', {
      jobId: job.id,
      documentId: job.data.documentId,
    });
  });

  worker.on('failed', async (job, error) => {
    logger.error('Reminder job failed', {
      jobId: job?.id,
      documentId: job?.data.documentId,
      attemptsMade: job?.attemptsMade,
      error: error.message,
    });

    // Move to Dead Letter Queue after all retries exhausted
    if (job && shouldMoveToDeadLetterQueue(job)) {
      try {
        await moveToDeadLetterQueue(pool, job, error, QueueName.DEADLINE_REMINDERS);
        logger.info('Reminder job moved to Dead Letter Queue', { jobId: job.id });
      } catch (dlqError) {
        logger.error('Failed to move reminder job to DLQ', {
          jobId: job.id,
          error: (dlqError as Error).message,
        });
      }
    }
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn('Reminder job stalled (timeout exceeded)', {
      jobId,
      queueName: QueueName.DEADLINE_REMINDERS,
    });
  });

  worker.on('error', (error) => {
    logger.error('Reminder worker error', { error: error.message });
  });

  return worker;
};
