import { Pool } from 'pg';
import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { Signer, SignerData } from '@/models/Signer';
import { Branding } from '@/models/Branding';
import { EmailService, EmailBranding } from '@/services/emailService';
import { BrandingService } from '@/services/brandingService';
import { ScheduledSendJobData } from '@/services/scheduledSendService';
import { socketService } from '@/services/socketService';
import { createEmailLogService } from '@/services/emailLogService';
import { getSettingsService } from '@/services/settingsService';
import { buildSigningUrl } from '@/utils/urlBuilder';
import logger from '@/services/loggerService';

/**
 * Scheduled Send Worker
 * Processes scheduled document sending jobs from the pg-boss queue.
 *
 * Final-failure Dead Letter Queue handling is owned by `registerWorker`
 * (backend/src/config/queue.ts) - this worker only needs to throw on
 * failure and let the shared wrapper detect `retryCount >= retryLimit` and
 * write the DLQ entry. There is no per-job progress reporting or worker
 * event stream in pg-boss the way BullMQ had it.
 */
export class ScheduledSendWorker {
  private pool: Pool;
  private emailService: EmailService;
  private brandingService: BrandingService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.brandingService = new BrandingService(pool);

    // Initialize email service. Config (SMTP + app URL) is resolved fresh
    // from instance settings (DB -> env -> default) on every send - see
    // settingsService.getEmailConfig(). This worker is long-lived, so a
    // settings change takes effect on the very next job without a restart.
    const emailLogService = createEmailLogService(pool);
    this.emailService = EmailService.withProvider(
      () => getSettingsService(pool).getEmailConfig(),
      emailLogService
    );
  }

  /**
   * Register this worker's handler with pg-boss.
   */
  async register(): Promise<void> {
    await registerWorker(QueueName.SCHEDULED_SEND, this.processJob.bind(this), {
      localConcurrency: 5, // Process 5 scheduled sends concurrently
    });

    logger.info('Scheduled send worker initialized');
  }

  /**
   * Process scheduled send job
   */
  private async processJob(job: NormalizedJob): Promise<{ success: boolean; sentAt: string }> {
    const { documentId, scheduledAt, userId } = job.data as ScheduledSendJobData;

    logger.info('Processing scheduled send', {
      jobId: job.id,
      documentId,
      scheduledAt,
    });

    try {
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

      // Get all signers
      const signersResult = await this.pool.query(
        'SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order ASC',
        [documentId]
      );

      if (signersResult.rows.length === 0) {
        logger.error('No signers found for scheduled document', { documentId });
        throw new Error('No signers found for document');
      }

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

      // Resolve app base URL fresh (per send) from instance settings
      const baseUrl = await getSettingsService(this.pool).getAppUrl();

      // Fetch branding for email customization
      const emailBranding = await this.getEmailBranding(docRow.team_id, baseUrl);

      if (workflowType === 'sequential') {
        // For sequential workflow, only send to first pending signer
        const firstSigner = signers.find((s) => s.status === 'pending' && s.signing_order === 0) || signers[0];
        if (firstSigner) {
          await this.sendSigningEmail(firstSigner, documentId, docRow.title, senderName, baseUrl, userId, emailBranding);
        }
      } else {
        // For parallel workflow, send to all signers
        await Promise.all(
          signers.map((signer) => this.sendSigningEmail(signer, documentId, docRow.title, senderName, baseUrl, userId, emailBranding))
        );
      }

      // Emit WebSocket event
      socketService.emitDocumentUpdate({
        documentId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
        ownerId: userId,
      });

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
   * Convert Branding model to EmailBranding interface
   */
  private convertToEmailBranding(branding: Branding, baseUrl: string): EmailBranding {
    return {
      companyName: branding.company_name,
      logoUrl: branding.getLogoUrl(baseUrl),
      primaryColor: branding.primary_color,
      secondaryColor: branding.secondary_color,
      footerText: branding.email_footer_text,
      supportEmail: branding.support_email,
      supportUrl: branding.support_url,
      privacyUrl: branding.privacy_url,
      termsUrl: branding.terms_url,
      showPoweredBy: branding.show_powered_by,
      hideEzsignBranding: branding.hide_ezsign_branding,
    };
  }

  /**
   * Get email branding for a document based on its team_id
   */
  private async getEmailBranding(teamId: string | null | undefined, baseUrl: string): Promise<EmailBranding | undefined> {
    if (!teamId) {
      return undefined;
    }

    try {
      const branding = await this.brandingService.getByTeamId(teamId);
      if (branding) {
        return this.convertToEmailBranding(branding, baseUrl);
      }
    } catch (error) {
      logger.warn('Failed to fetch branding for scheduled send email', {
        teamId,
        error: (error as Error).message,
      });
    }

    return undefined;
  }

  /**
   * Send signing email to a signer
   */
  private async sendSigningEmail(
    signer: Signer,
    documentId: string,
    documentTitle: string,
    senderName: string,
    baseUrl: string,
    userId: string,
    branding?: EmailBranding
  ): Promise<void> {
    try {
      await this.emailService.sendSigningRequest({
        recipientEmail: signer.email,
        recipientName: signer.name || signer.email,
        documentTitle,
        senderName,
        signingUrl: buildSigningUrl(baseUrl, signer.access_token),
        branding,
        documentId,
        signerId: signer.id,
        userId,
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
}

// Factory function to create and register the worker
export const createScheduledSendWorker = async (pool: Pool): Promise<void> => {
  const worker = new ScheduledSendWorker(pool);
  await worker.register();
};
