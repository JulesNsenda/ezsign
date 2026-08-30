import nodemailer, { Transporter } from 'nodemailer';
import logger from '@/services/loggerService';
import { EmailLogService, EmailType } from '@/services/emailLogService';
import { buildSigningUrl, buildDownloadUrl } from '@/utils/urlBuilder';
import { escapeHtml, safeUrl, safeMailto } from '@/utils/emailTemplate';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

/**
 * Async config resolver for provider-mode EmailService instances (see
 * `EmailService.withProvider`). Called fresh on every send so a config
 * change (e.g. an admin editing SMTP settings in the UI) takes effect
 * without restarting the process - typically backed by
 * `settingsService.getEmailConfig()`.
 */
export type EmailConfigProvider = () => Promise<EmailConfig>;

/**
 * Raw email payload for `EmailService.sendCustomEmail` - used by callers
 * that build their own HTML/text outside the built-in templates.
 */
export interface CustomEmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * How this send is logged in `email_logs`. Defaults to `'welcome'` - the
   * closest existing value in email_logs' email_type CHECK constraint
   * (migration `1769442694565_add-email-logs-table.js`); there is no
   * dedicated `'invitation'` value yet and adding one is a migration change,
   * out of scope here.
   */
  emailType?: EmailType;
  /** Logging context - see `EmailContext`. */
  context?: EmailContext;
}

export interface EmailContext {
  documentId?: string;
  signerId?: string;
  userId?: string;
}

/**
 * Branding data for email customization
 */
export interface EmailBranding {
  companyName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  footerText?: string | null;
  supportEmail?: string | null;
  supportUrl?: string | null;
  privacyUrl?: string | null;
  termsUrl?: string | null;
  showPoweredBy?: boolean;
  hideEzsignBranding?: boolean;
}

/**
 * Default branding values
 */
const DEFAULT_BRANDING: Required<Pick<EmailBranding, 'companyName' | 'primaryColor' | 'secondaryColor' | 'showPoweredBy' | 'hideEzsignBranding'>> = {
  companyName: 'EzSign',
  primaryColor: '#4F46E5',
  secondaryColor: '#10B981',
  showPoweredBy: true,
  hideEzsignBranding: false,
};

export interface SigningRequestEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  senderName: string;
  signingUrl: string;
  message?: string;
  isReminder?: boolean;
  // Context for email logging
  documentId?: string;
  signerId?: string;
  userId?: string;
  // Branding customization
  branding?: EmailBranding;
}

export interface CompletionEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  completedAt: Date;
  downloadUrl?: string;
  // Context for email logging
  documentId?: string;
  userId?: string;
  // Branding customization
  branding?: EmailBranding;
}

export interface ReminderEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  senderName: string;
  signingUrl: string;
  daysWaiting: number;
  // Context for email logging
  documentId?: string;
  signerId?: string;
  userId?: string;
  // Branding customization
  branding?: EmailBranding;
}

export interface PasswordChangeEmailData {
  recipientEmail: string;
  recipientName: string;
  changedAt: Date;
  ipAddress?: string;
  resetPasswordUrl?: string;
  // Context for email logging
  userId?: string;
}

export class EmailService {
  // Legacy (fixed-config) mode - all three set together in the legacy
  // constructor path, all `undefined` in provider mode.
  private transporter?: Transporter;
  private fromEmail?: string;
  private baseUrl?: string;
  // Provider mode - resolves config + builds the transporter fresh on every
  // send (see `resolveSendConfig`), so a settings change takes effect
  // without a restart. Cheap: nodemailer transporter construction does no
  // I/O, it just holds config until `sendMail`/`verify` is called.
  private configProvider?: EmailConfigProvider;
  private emailLogService?: EmailLogService;

  /** Legacy: fixed config + baseUrl resolved once at construction time. */
  constructor(config: EmailConfig, baseUrl: string, emailLogService?: EmailLogService);
  /** Provider mode: config + baseUrl resolved fresh on every send. */
  constructor(provider: EmailConfigProvider, emailLogService?: EmailLogService);
  constructor(
    configOrProvider: EmailConfig | EmailConfigProvider,
    baseUrlOrEmailLogService?: string | EmailLogService,
    emailLogService?: EmailLogService
  ) {
    if (typeof configOrProvider === 'function') {
      this.configProvider = configOrProvider;
      this.emailLogService = baseUrlOrEmailLogService as EmailLogService | undefined;
      return;
    }

    this.transporter = this.createTransporter(configOrProvider);
    this.fromEmail = configOrProvider.from;
    this.baseUrl = baseUrlOrEmailLogService as string;
    this.emailLogService = emailLogService;
  }

  /**
   * Preferred entry point for provider-mode construction - reads slightly
   * cleaner than `new EmailService(provider, emailLogService)` at call
   * sites. Equivalent to the provider-mode constructor overload.
   */
  static withProvider(provider: EmailConfigProvider, emailLogService?: EmailLogService): EmailService {
    return new EmailService(provider, emailLogService);
  }

  /**
   * Set the email log service (for dependency injection after construction)
   */
  setEmailLogService(service: EmailLogService): void {
    this.emailLogService = service;
  }

  private createTransporter(config: EmailConfig): Transporter {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.auth && {
        auth: {
          user: config.auth.user,
          pass: config.auth.pass,
        },
      }),
    });
  }

  /**
   * Resolves the transporter/from-address to use for the send that is about
   * to happen. In provider mode this calls the injected provider (e.g.
   * `settingsService.getEmailConfig()`) and builds a fresh transporter every
   * time - avoids ever caching a stale SMTP config. In legacy mode it just
   * returns the values captured at construction.
   */
  private async resolveSendConfig(): Promise<{ transporter: Transporter; fromEmail: string }> {
    if (this.configProvider) {
      const config = await this.configProvider();
      return {
        transporter: this.createTransporter(config),
        fromEmail: config.from,
      };
    }

    return {
      transporter: this.transporter as Transporter,
      fromEmail: this.fromEmail as string,
    };
  }

  /**
   * Internal helper to send email with logging.
   *
   * Item 2.1: the log row is created *first*, before config resolution -
   * `resolveSendConfig()` now runs inside the same try that reports failure,
   * so a throw during resolution (e.g. `decryptSecret` on `smtp.pass` or
   * `coerceFromStorage` on `smtp.port`/`smtp.secure`; a bad SMTP *host* does
   * NOT throw here, since `nodemailer.createTransport` never connects) still
   * leaves a visible `failed` row instead of no row at all. There is no
   * `resolved?` bypass anymore - every caller (including
   * `sendEmailVerification` and `sendCustomEmail`) goes through this single
   * path, so every email type gets a failure row.
   *
   * `generateHtml`/`generateText` are lazy (called inside the same try as
   * `resolveSendConfig`/`sendMail`, not pre-computed by the caller) so that a
   * throw from template generation - e.g. `requireStructuralUrl` rejecting an
   * unrenderable signing/verification/reset-password/download URL - also
   * produces a `failed` row instead of an unhandled rejection with no
   * visible evidence at all.
   */
  private async sendWithLogging(
    recipientEmail: string,
    subject: string,
    emailType: EmailType,
    generateHtml: () => string,
    generateText: () => string,
    context: EmailContext = {}
  ): Promise<void> {
    let logId: string | undefined;

    // Create log entry if service is available
    if (this.emailLogService) {
      try {
        const log = await this.emailLogService.createLog({
          documentId: context.documentId,
          signerId: context.signerId,
          userId: context.userId,
          recipientEmail,
          emailType,
          subject,
          metadata: { context },
        });
        logId = log.id;
      } catch (error) {
        logger.warn('Failed to create email log', { error: (error as Error).message });
      }
    }

    try {
      const html = generateHtml();
      const text = generateText();
      const { transporter, fromEmail } = await this.resolveSendConfig();
      const result = await transporter.sendMail({
        from: fromEmail,
        to: recipientEmail,
        subject,
        text,
        html,
      });

      // Mark as sent with message ID - guarded in its own try/catch (mirrors
      // the `markAsFailed` guard below) so a DB failure here, after
      // nodemailer has already accepted the message, cannot fall into the
      // outer catch and get misreported as a failed send. Without this, a
      // resend of a message the recipient already received would put a
      // second, live signing link in their inbox.
      if (logId && this.emailLogService) {
        try {
          await this.emailLogService.markAsSent(logId, result.messageId);
        } catch (markError) {
          logger.warn('Failed to mark email log as sent', {
            error: (markError as Error).message,
            emailLogId: logId,
          });
        }
      }

      logger.debug('Email sent successfully', {
        to: recipientEmail,
        subject,
        emailType,
        messageId: result.messageId,
      });
    } catch (error) {
      // Mark as failed - guarded in its own try/catch (mirrors the
      // `createLog` guard above) so a DB failure here cannot mask the
      // original send/resolution error that is rethrown below.
      if (logId && this.emailLogService) {
        try {
          await this.emailLogService.markAsFailed(logId, (error as Error).message);
        } catch (markError) {
          logger.warn('Failed to mark email log as failed', {
            error: (markError as Error).message,
            emailLogId: logId,
          });
        }
      }

      logger.error('Failed to send email', {
        to: recipientEmail,
        subject,
        emailType,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Send signing request email
   */
  async sendSigningRequest(data: SigningRequestEmailData): Promise<void> {
    const baseSubject = `${data.senderName} has requested your signature on "${data.documentTitle}"`;
    const subject = data.isReminder ? `Reminder: ${baseSubject}` : baseSubject;

    const emailType: EmailType = data.isReminder ? 'reminder' : 'signing_request';

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      emailType,
      () => this.generateSigningRequestHtml(data),
      () => this.generateSigningRequestText(data),
      {
        documentId: data.documentId,
        signerId: data.signerId,
        userId: data.userId,
      }
    );
  }

  /**
   * Send document completion notification
   */
  async sendCompletionNotification(data: CompletionEmailData): Promise<void> {
    const subject = `Document "${data.documentTitle}" has been completed`;

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'completion',
      () => this.generateCompletionHtml(data),
      () => this.generateCompletionText(data),
      {
        documentId: data.documentId,
        userId: data.userId,
      }
    );
  }

  /**
   * Send reminder email
   */
  async sendReminder(data: ReminderEmailData): Promise<void> {
    const subject = `Reminder: Please sign "${data.documentTitle}"`;

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'reminder',
      () => this.generateReminderHtml(data),
      () => this.generateReminderText(data),
      {
        documentId: data.documentId,
        signerId: data.signerId,
        userId: data.userId,
      }
    );
  }

  /**
   * Send password change notification
   */
  async sendPasswordChangeNotification(
    data: PasswordChangeEmailData
  ): Promise<void> {
    const subject = 'Password Changed - EzSign';

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'password_change',
      () => this.generatePasswordChangeHtml(data),
      () => this.generatePasswordChangeText(data),
      {
        userId: data.userId,
      }
    );
  }

  /**
   * Validates a "structural" URL - one the email exists to deliver
   * (signing/verification/reset-password/download links) - and throws if it
   * fails `safeUrl` validation, e.g. if `app.url` is misconfigured without a
   * scheme (only the admin-write path validates it via `appUrlSchema`;
   * env-sourced `APP_URL`/`BASE_URL` do not go through that check - see
   * `SettingsService.getAppUrl()`). A blank `href` here is worse than the
   * injection Item 0 fixes: it silently breaks the one thing the email
   * exists to deliver. Since generation now runs inside `sendWithLogging`'s
   * try, the throw is recorded as a `failed` email_logs row with a real
   * reason instead of a warn line nobody reads.
   *
   * Decorative URLs (logoUrl/supportUrl/privacyUrl/termsUrl) are NOT routed
   * through here - a missing logo or footer link is cosmetic, so those keep
   * the drop-and-continue behavior of a bare `safeUrl()` call.
   *
   * Returns `''` unchanged (no throw) when `original` itself is empty -
   * omitting an *optional* structural URL (e.g. no `downloadUrl` on a
   * completion email) is a valid choice, not a validation failure.
   */
  private requireStructuralUrl(label: string, original: string | undefined): string {
    if (!original) {
      return '';
    }
    const validated = safeUrl(original);
    if (!validated) {
      throw new Error(`Email ${label} URL failed validation: "${original}"`);
    }
    return validated;
  }

  /**
   * Generate signing request HTML email
   */
  private generateSigningRequestHtml(data: SigningRequestEmailData): string {
    const branding = data.branding || {};
    const rawCompanyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const companyName = escapeHtml(rawCompanyName);
    // Escaped even though this is typically a hex color already validated
    // upstream (Branding.validate/isValidHexColor) - EmailBranding here is a
    // plain caller-supplied object with no guarantee it went through that
    // validation, and escapeHtml is the identity function on a well-formed
    // hex value (e.g. '#4F46E5'), so escaping costs nothing when the input
    // is valid and closes the gap when it isn't.
    const primaryColor = escapeHtml(branding.primaryColor || DEFAULT_BRANDING.primaryColor);
    const headerColor = data.isReminder ? '#f59e0b' : primaryColor;
    const buttonColor = data.isReminder ? '#f59e0b' : primaryColor;
    const headerTitle = data.isReminder ? 'Signature Reminder' : 'Signature Request';
    const footerText = escapeHtml(branding.footerText || `This is an automated email from ${rawCompanyName}. Please do not reply to this email.`);
    const logoUrl = safeUrl(branding.logoUrl);
    const signingUrl = this.requireStructuralUrl('signing', data.signingUrl);
    const recipientName = escapeHtml(data.recipientName);
    const senderName = escapeHtml(data.senderName);
    const documentTitle = escapeHtml(data.documentTitle);
    const message = escapeHtml(data.message);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; }
            .logo { max-height: 40px; margin-bottom: 10px; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: ${buttonColor};
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .footer-links { margin-top: 10px; }
            .footer-links a { color: #6b7280; text-decoration: none; margin: 0 10px; }
            .message { background-color: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .reminder { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .link-box { background-color: #f3f4f6; padding: 12px; border-radius: 5px; margin: 15px 0; word-break: break-all; overflow-wrap: break-word; font-size: 12px; }
            .link-box a { color: ${primaryColor}; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>${headerTitle}</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              ${data.isReminder
                ? `<p>This is a friendly reminder that <strong>${senderName}</strong> is waiting for your signature on the following document:</p>`
                : `<p><strong>${senderName}</strong> has requested your signature on the following document:</p>`
              }
              <h3>${documentTitle}</h3>
              ${data.isReminder ? '<div class="reminder"><strong>⏰ Action Required:</strong> Please review and sign this document at your earliest convenience.</div>' : ''}
              ${message ? `<div class="message"><strong>Message:</strong><br>${message}</div>` : ''}
              <p>Please click the button below to review and sign the document:</p>
              <div style="text-align: center;">
                <a href="${signingUrl}" class="button">Review & Sign Document</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${signingUrl}">${signingUrl}</a></div>
            </div>
            <div class="footer">
              <p>${footerText}</p>
              ${this.generateFooterLinks(branding)}
              ${branding.showPoweredBy !== false && !branding.hideEzsignBranding ? `<p style="font-size: 12px; color: #9ca3af;">Powered by ${companyName}</p>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate signing request plain text email
   */
  private generateSigningRequestText(data: SigningRequestEmailData): string {
    const introText = data.isReminder
      ? `This is a friendly reminder that ${data.senderName} is waiting for your signature on the following document:`
      : `${data.senderName} has requested your signature on the following document:`;

    return `
Hello ${data.recipientName},

${introText}

${data.documentTitle}

${data.isReminder ? '⏰ Action Required: Please review and sign this document at your earliest convenience.\n\n' : ''}${data.message ? `Message: ${data.message}\n\n` : ''}Please visit the following link to review and sign the document:

${data.signingUrl}

---
This is an automated email from EzSign. Please do not reply to this email.
    `.trim();
  }

  /**
   * Generate completion notification HTML email
   */
  private generateCompletionHtml(data: CompletionEmailData): string {
    const branding = data.branding || {};
    const rawCompanyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const companyName = escapeHtml(rawCompanyName);
    // Escaped for the same reason as generateSigningRequestHtml's
    // primaryColor - see that comment.
    const secondaryColor = escapeHtml(branding.secondaryColor || DEFAULT_BRANDING.secondaryColor);
    const footerText = escapeHtml(branding.footerText || `This is an automated email from ${rawCompanyName}. Please do not reply to this email.`);
    const logoUrl = safeUrl(branding.logoUrl);
    const downloadUrl = this.requireStructuralUrl('download', data.downloadUrl);
    const recipientName = escapeHtml(data.recipientName);
    const documentTitle = escapeHtml(data.documentTitle);

    const formattedDate = data.completedAt.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${secondaryColor}; color: white; padding: 20px; text-align: center; }
            .logo { max-height: 40px; margin-bottom: 10px; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: ${secondaryColor};
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .footer-links { margin-top: 10px; }
            .footer-links a { color: #6b7280; text-decoration: none; margin: 0 10px; }
            .info { background-color: #d1fae5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>✓ Document Completed</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p>Great news! The following document has been fully signed and completed:</p>
              <h3>${documentTitle}</h3>
              <div class="info">
                <strong>Completed on:</strong> ${formattedDate}
              </div>
              ${downloadUrl ? `
              <p>You can download the signed document using the button below:</p>
              <div style="text-align: center;">
                <a href="${downloadUrl}" class="button">Download Document</a>
              </div>
              ` : ''}
            </div>
            <div class="footer">
              <p>${footerText}</p>
              ${this.generateFooterLinks(branding)}
              ${branding.showPoweredBy !== false && !branding.hideEzsignBranding ? `<p style="font-size: 12px; color: #9ca3af;">Powered by ${companyName}</p>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate completion notification plain text email
   */
  private generateCompletionText(data: CompletionEmailData): string {
    const formattedDate = data.completedAt.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

    return `
Hello ${data.recipientName},

Great news! The following document has been fully signed and completed:

${data.documentTitle}

Completed on: ${formattedDate}

${data.downloadUrl ? `Download the signed document here: ${data.downloadUrl}\n\n` : ''}
---
This is an automated email from EzSign. Please do not reply to this email.
    `.trim();
  }

  /**
   * Generate reminder HTML email
   */
  private generateReminderHtml(data: ReminderEmailData): string {
    const branding = data.branding || {};
    const rawCompanyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const companyName = escapeHtml(rawCompanyName);
    const footerText = escapeHtml(branding.footerText || `This is an automated email from ${rawCompanyName}. Please do not reply to this email.`);
    const logoUrl = safeUrl(branding.logoUrl);
    const signingUrl = this.requireStructuralUrl('signing', data.signingUrl);
    const recipientName = escapeHtml(data.recipientName);
    const senderName = escapeHtml(data.senderName);
    const documentTitle = escapeHtml(data.documentTitle);
    // Reminders use amber color for urgency, regardless of branding
    const reminderColor = '#f59e0b';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${reminderColor}; color: white; padding: 20px; text-align: center; }
            .logo { max-height: 40px; margin-bottom: 10px; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: ${reminderColor};
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .footer-links { margin-top: 10px; }
            .footer-links a { color: #6b7280; text-decoration: none; margin: 0 10px; }
            .reminder { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .link-box { background-color: #f3f4f6; padding: 12px; border-radius: 5px; margin: 15px 0; word-break: break-all; overflow-wrap: break-word; font-size: 12px; }
            .link-box a { color: ${reminderColor}; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>Signature Reminder</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p>This is a friendly reminder that <strong>${senderName}</strong> is waiting for your signature on:</p>
              <h3>${documentTitle}</h3>
              <div class="reminder">
                <strong>Waiting for:</strong> ${data.daysWaiting} day${data.daysWaiting !== 1 ? 's' : ''}
              </div>
              <p>Please take a moment to review and sign the document:</p>
              <div style="text-align: center;">
                <a href="${signingUrl}" class="button">Sign Document Now</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${signingUrl}">${signingUrl}</a></div>
            </div>
            <div class="footer">
              <p>${footerText}</p>
              ${this.generateFooterLinks(branding)}
              ${branding.showPoweredBy !== false && !branding.hideEzsignBranding ? `<p style="font-size: 12px; color: #9ca3af;">Powered by ${companyName}</p>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate reminder plain text email
   */
  private generateReminderText(data: ReminderEmailData): string {
    return `
Hello ${data.recipientName},

This is a friendly reminder that ${data.senderName} is waiting for your signature on:

${data.documentTitle}

Waiting for: ${data.daysWaiting} day${data.daysWaiting !== 1 ? 's' : ''}

Please visit the following link to sign the document:

${data.signingUrl}

---
This is an automated email from EzSign. Please do not reply to this email.
    `.trim();
  }

  /**
   * Generate password change notification HTML email
   */
  private generatePasswordChangeHtml(data: PasswordChangeEmailData): string {
    const formattedDate = data.changedAt.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const recipientName = escapeHtml(data.recipientName);
    const ipAddress = escapeHtml(data.ipAddress);
    const resetPasswordUrl = this.requireStructuralUrl('reset-password', data.resetPasswordUrl);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #ef4444;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .info { background-color: #fee2e2; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .warning { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #f59e0b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Password Changed</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p>Your password was successfully changed for your EzSign account.</p>
              <div class="info">
                <strong>Changed on:</strong> ${formattedDate}<br>
                ${ipAddress ? `<strong>IP Address:</strong> ${ipAddress}<br>` : ''}
              </div>
              <div class="warning">
                <strong>⚠️ Didn't make this change?</strong><br>
                If you did not change your password, someone may have accessed your account. Please reset your password immediately.
                ${resetPasswordUrl ? `
                <div style="text-align: center; margin-top: 15px;">
                  <a href="${resetPasswordUrl}" class="button">Reset Password</a>
                </div>
                ` : ''}
              </div>
              <p>If you made this change, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from EzSign. Please do not reply to this email.</p>
              <p>If you have any concerns, please contact support.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate password change notification plain text email
   */
  private generatePasswordChangeText(data: PasswordChangeEmailData): string {
    const formattedDate = data.changedAt.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

    return `
Hello ${data.recipientName},

Your password was successfully changed for your EzSign account.

Changed on: ${formattedDate}
${data.ipAddress ? `IP Address: ${data.ipAddress}\n` : ''}
⚠️ DIDN'T MAKE THIS CHANGE?

If you did not change your password, someone may have accessed your account. Please reset your password immediately.
${data.resetPasswordUrl ? `\nReset your password here: ${data.resetPasswordUrl}\n` : ''}
If you made this change, you can safely ignore this email.

---
This is an automated email from EzSign. Please do not reply to this email.
If you have any concerns, please contact support.
    `.trim();
  }

  /**
   * Generate footer links HTML based on branding
   */
  private generateFooterLinks(branding: EmailBranding): string {
    const links: string[] = [];

    const supportUrl = safeUrl(branding.supportUrl);
    const supportMailto = safeMailto(branding.supportEmail);
    if (supportUrl) {
      links.push(`<a href="${supportUrl}">Support</a>`);
    } else if (supportMailto) {
      links.push(`<a href="${supportMailto}">Contact Support</a>`);
    }

    const privacyUrl = safeUrl(branding.privacyUrl);
    if (privacyUrl) {
      links.push(`<a href="${privacyUrl}">Privacy Policy</a>`);
    }

    const termsUrl = safeUrl(branding.termsUrl);
    if (termsUrl) {
      links.push(`<a href="${termsUrl}">Terms of Service</a>`);
    }

    if (links.length === 0) {
      return '';
    }

    return `<div class="footer-links">${links.join(' | ')}</div>`;
  }

  /**
   * Verify email configuration
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const { transporter } = await this.resolveSendConfig();
      await transporter.verify();
      return true;
    } catch (error) {
      logger.error('Email service verification failed', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Generate signing URL for a signer.
   *
   * Legacy (fixed-baseUrl) mode only - provider-mode instances have no
   * single `baseUrl` to read synchronously. Provider-mode callers should
   * resolve `baseUrl` via `settingsService.getAppUrl()` themselves and call
   * `buildSigningUrl()` directly.
   */
  generateSigningUrl(accessToken: string): string {
    if (this.baseUrl === undefined) {
      throw new Error(
        'EmailService.generateSigningUrl() is only available on legacy (fixed-baseUrl) instances; ' +
          'resolve baseUrl via SettingsService.getAppUrl() and call buildSigningUrl() directly.'
      );
    }
    return buildSigningUrl(this.baseUrl, accessToken);
  }

  /**
   * Generate document download URL.
   *
   * Legacy (fixed-baseUrl) mode only - see `generateSigningUrl` doc.
   */
  generateDownloadUrl(documentId: string): string {
    if (this.baseUrl === undefined) {
      throw new Error(
        'EmailService.generateDownloadUrl() is only available on legacy (fixed-baseUrl) instances; ' +
          'resolve baseUrl via SettingsService.getAppUrl() and call buildDownloadUrl() directly.'
      );
    }
    return buildDownloadUrl(this.baseUrl, documentId);
  }

  /**
   * Sends a fully custom (non-templated) email using the resolved
   * transporter/from-address. Replaces callers that used to reach into
   * `(emailService as any).transporter`/`.fromEmail` directly (see
   * InvitationController.sendInvitationEmail, the only current caller, which
   * passes neither `emailType` nor `context` and so is logged as `'welcome'`
   * with no linked document/signer/user - see `CustomEmailData.emailType`
   * doc). Routed through `sendWithLogging` like every other send path so
   * invitation emails get a visible row in email_logs instead of being
   * invisible to that surface.
   */
  async sendCustomEmail(data: CustomEmailData): Promise<void> {
    await this.sendWithLogging(
      data.to,
      data.subject,
      data.emailType ?? 'welcome',
      () => data.html,
      () => data.text,
      data.context ?? {}
    );
  }

  /**
   * Send email verification email.
   *
   * Item 2.1: `baseUrl` is supplied by the caller (resolved via
   * `settingsService.getAppUrl()`, the pattern `signingController.ts` and
   * `signerController.ts` already use) rather than pre-resolved here via
   * `resolveSendConfig()`. Pre-resolving used to bypass `sendWithLogging`'s
   * log-first ordering, which would have left `verification` as the one
   * email type with no failed row on a resolution error.
   */
  async sendEmailVerification(data: {
    recipientEmail: string;
    recipientName: string;
    verificationToken: string;
    baseUrl: string;
    userId?: string;
  }): Promise<void> {
    const verificationUrl = `${data.baseUrl}/verify-email?token=${data.verificationToken}`;
    const subject = 'Verify your email address - EzSign';

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'verification',
      () => this.generateEmailVerificationHtml(data.recipientName, verificationUrl),
      () => this.generateEmailVerificationText(data.recipientName, verificationUrl),
      {
        userId: data.userId,
      }
    );
  }

  /**
   * Generate email verification HTML
   */
  private generateEmailVerificationHtml(recipientName: string, verificationUrl: string): string {
    const safeRecipientName = escapeHtml(recipientName);
    const safeVerificationUrl = this.requireStructuralUrl('verification', verificationUrl);
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #4F46E5;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .info { background-color: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .link-box { background-color: #f3f4f6; padding: 12px; border-radius: 5px; margin: 15px 0; word-break: break-all; overflow-wrap: break-word; font-size: 12px; }
            .link-box a { color: #4F46E5; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to EzSign!</h1>
            </div>
            <div class="content">
              <p>Hello ${safeRecipientName},</p>
              <p>Thank you for registering with EzSign. To complete your registration and start using our document signing platform, please verify your email address.</p>
              <div class="info">
                <strong>⏰ Important:</strong> This verification link will expire in 24 hours.
              </div>
              <p>Click the button below to verify your email:</p>
              <div style="text-align: center;">
                <a href="${safeVerificationUrl}" class="button">Verify Email Address</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${safeVerificationUrl}">${safeVerificationUrl}</a></div>
              <p>If you didn't create an account with EzSign, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from EzSign. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate email verification plain text
   */
  private generateEmailVerificationText(recipientName: string, verificationUrl: string): string {
    return `
Hello ${recipientName},

Thank you for registering with EzSign. To complete your registration and start using our document signing platform, please verify your email address.

⏰ Important: This verification link will expire in 24 hours.

Please visit the following link to verify your email:

${verificationUrl}

If you didn't create an account with EzSign, you can safely ignore this email.

---
This is an automated email from EzSign. Please do not reply to this email.
    `.trim();
  }
}
