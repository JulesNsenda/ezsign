import { Job, Worker } from 'bullmq';
import { Pool } from 'pg';
import { createWorker, QueueName } from '@/config/queue';
import { Signer, SignerData } from '@/models/Signer';
import { EmailService, EmailConfig } from '@/services/emailService';
import { ScheduledSendJobData } from '@/services/scheduledSendService';
import { socketService } from '@/services/socketService';
import logger from '@/services/loggerService';

/**
 * Scheduled Send Worker
 * Processes scheduled document sending jobs from the queue
 */
export class ScheduledSendWorker {
  private worker: Worker<ScheduledSendJobData>;
  private pool: Pool;
  private emailService: EmailService;

  constructor(pool: Pool) {
    this.pool = pool;

    // Initialize email service
    const emailUser = process.env.EMAIL_SMTP_USER || '';
    const emailPass = process.env.EMAIL_SMTP_PASS || '';
    const emailConfig: EmailConfig = {
      host: process.env.EMAIL_SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
      secure: process.env.EMAIL_SMTP_SECURE === 'true',
      auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      from: process.env.EMAIL_FROM || 'noreply@ezsign.com',
    };
    const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000';
    this.emailService = new EmailService(emailConfig, baseUrl);

    this.worker = createWorker<ScheduledSendJobData>(
      QueueName.SCHEDULED_SEND,
      this.processJob.bind(this),
      {
        concurrency: 5, // Process 5 scheduled sends concurrently
        limiter: {
          max: 10,
          duration: 1000,
        },
      }
    );

    this.setupEventListeners();
    logger.info('Scheduled send worker initialized');
  }

  /**
   * Process scheduled send job
   */
  private async processJob(job: Job<ScheduledSendJobData>): Promise<{ success: boolean; sentAt: string }> {
    const { documentId, scheduledAt, userId } = job.data;

    logger.info('Processing scheduled send', {
      jobId: job.id,
      documentId,
      scheduledAt,
    });

    try {
      await job.updateProgress(10);

      // Get document and verify it's still scheduled
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        logger.warn('Document not found for scheduled send', { documentId });
        return { success: false, sentAt: new Date().toISOString() };
      }

      const docRow = docResult.rows[0];

      if (docRow.status !== 'scheduled') {
        logger.info('Document no longer scheduled, skipping', {
          documentId,
          currentStatus: docRow.status,
        });
        return { success: false, sentAt: new Date().toISOString() };
      }

      await job.updateProgress(20);

      // Get all signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order ASC',
        [documentId]
      );

      if (signersResult.rows.length === 0) {
        logger.error('No signers found for scheduled document', { documentId });
        throw new Error('No signers found for document');
      }

      await job.updateProgress(40);

      // Update document status to pending
      await this.pool.query(
        `UPDATE documents
         SET status = 'pending',
             scheduled_send_at = NULL,
             scheduled_timezone = NULL,
             schedule_job_id = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [documentId]
      );

      await job.updateProgress(60);

      // Get sender info
      const userResult = await this.pool.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      const senderEmail = userResult.rows[0]?.email || 'Unknown';
      const senderName = senderEmail.split('@')[0]; // Use email prefix as name

      // Send signing requests based on workflow type
      const signers = signersResult.rows.map((row) => new Signer({
        id: row.id,
        document_id: row.document_id,
        email: row.email,
        name: row.name,
        signing_order: row.signing_order,
        status: row.status,
        access_token: row.access_token,
        signed_at: row.signed_at,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        last_reminder_sent_at: row.last_reminder_sent_at,
        reminder_count: row.reminder_count || 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as SignerData));

      const workflowType = docRow.workflow_type || 'parallel';

      if (workflowType === 'sequential') {
        // For sequential workflow, only send to first pending signer
        const firstSigner = signers.find((s) => s.status === 'pending' && s.signing_order === 0) || signers[0];
        if (firstSigner) {
          await this.sendSigningEmail(firstSigner, docRow.title, senderName);
        }
      } else {
        // For parallel workflow, send to all signers
        await Promise.all(
          signers.map((signer) => this.sendSigningEmail(signer, docRow.title, senderName))
        );
      }

      await job.updateProgress(80);

      // Emit WebSocket event
      socketService.emitDocumentUpdate({
        documentId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
        ownerId: userId,
      });

      await job.updateProgress(100);

      logger.info('Scheduled send completed successfully', {
        documentId,
        signerCount: signers.length,
        workflowType,
      });

      return { success: true, sentAt: new Date().toISOString() };
    } catch (error) {
      logger.error('Scheduled send failed', {
        documentId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Send signing email to a signer
   */
  private async sendSigningEmail(
    signer: Signer,
    documentTitle: string,
    senderName: string
  ): Promise<void> {
    try {
      await this.emailService.sendSigningRequest({
        recipientEmail: signer.email,
        recipientName: signer.name || signer.email,
        documentTitle,
        senderName,
        signingUrl: `${process.env.APP_URL || 'http://localhost:3000'}/sign/${signer.access_token}`,
      });

      // Update signer to show email was sent
      await this.pool.query(
        `UPDATE signers SET status = 'pending', updated_at = NOW() WHERE id = $1`,
        [signer.id]
      );

      logger.debug('Signing email sent', {
        signerId: signer.id,
        email: signer.email,
      });
    } catch (error) {
      logger.error('Failed to send signing email', {
        signerId: signer.id,
        email: signer.email,
        error: (error as Error).message,
      });
      // Don't throw - continue with other signers
    }
  }

  /**
   * Set up event listeners for the worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job: Job<ScheduledSendJobData>, result) => {
      logger.info('Scheduled send job completed', {
        jobId: job.id,
        documentId: job.data.documentId,
        result,
      });
    });

    this.worker.on('failed', (job: Job<ScheduledSendJobData> | undefined, error: Error) => {
      if (job) {
        logger.error('Scheduled send job failed', {
          jobId: job.id,
          documentId: job.data.documentId,
          error: error.message,
        });
      } else {
        logger.error('Scheduled send job failed (job undefined)', { error: error.message });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Scheduled send worker error', {
        error: error.message,
        stack: error.stack,
      });
    });

    this.worker.on('active', (job: Job<ScheduledSendJobData>) => {
      logger.debug('Scheduled send job active', {
        jobId: job.id,
        documentId: job.data.documentId,
      });
    });
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Scheduled send worker closed');
  }
}

// Factory function to create worker instance
export const createScheduledSendWorker = (pool: Pool): ScheduledSendWorker => {
  return new ScheduledSendWorker(pool);
};
