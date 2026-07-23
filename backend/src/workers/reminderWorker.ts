/**
 * Reminder Worker
 *
 * Processes deadline reminder jobs from the pg-boss queue and sends reminder
 * emails.
 *
 * Final-failure Dead Letter Queue handling is owned by `registerWorker`
 * (backend/src/config/queue.ts) - this worker only needs to throw on
 * failure and let the shared wrapper detect `retryCount >= retryLimit` and
 * write the DLQ entry. There is no per-job progress reporting or worker
 * event stream in pg-boss the way BullMQ had it.
 */

import { Pool } from 'pg';
import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { createReminderService, ReminderJobData } from '@/services/reminderService';
import { EmailService, EmailBranding } from '@/services/emailService';
import { createEmailLogService } from '@/services/emailLogService';
import { BrandingService } from '@/services/brandingService';
import { Branding } from '@/models/Branding';
import { getSettingsService } from '@/services/settingsService';
import { buildSigningUrl } from '@/utils/urlBuilder';
import logger from '@/services/loggerService';

/**
 * Convert Branding model to EmailBranding interface
 */
const convertToEmailBranding = (branding: Branding, baseUrl: string): EmailBranding => {
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
};

/**
 * Create and register the reminder worker
 */
export const createReminderWorker = async (pool: Pool): Promise<void> => {
  // Initialize services
  const reminderService = createReminderService(pool);
  const brandingService = new BrandingService(pool);

  // Email config (SMTP + app URL) is resolved fresh from instance settings
  // (DB -> env -> default) on every send - see settingsService.getEmailConfig().
  // This worker is long-lived, so a settings change takes effect on the very
  // next job without a process restart.
  const emailLogService = createEmailLogService(pool);
  const emailService = EmailService.withProvider(
    () => getSettingsService(pool).getEmailConfig(),
    emailLogService
  );

  const processJob = async (job: NormalizedJob): Promise<unknown> => {
    const { documentId, signerId, reminderType, reminderId } = job.data as ReminderJobData;

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
        `SELECT d.id, d.title, d.status, d.expires_at, d.user_id, d.team_id, u.email as owner_email, u.name as owner_name
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

      // Resolve app base URL fresh (per send) from instance settings
      const baseUrl = await getSettingsService(pool).getAppUrl();

      // Fetch branding for email customization
      let emailBranding: EmailBranding | undefined;
      if (doc.team_id) {
        try {
          const branding = await brandingService.getByTeamId(doc.team_id);
          if (branding) {
            emailBranding = convertToEmailBranding(branding, baseUrl);
          }
        } catch (error) {
          logger.warn('Failed to fetch branding for reminder email', {
            teamId: doc.team_id,
            error: (error as Error).message,
          });
        }
      }

      // Send reminder email
      const signingUrl = buildSigningUrl(baseUrl, signer.access_token);

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
        branding: emailBranding,
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
  };

  await registerWorker(QueueName.DEADLINE_REMINDERS, processJob, {
    localConcurrency: 5,
  });

  logger.info('Reminder worker initialized');
};
