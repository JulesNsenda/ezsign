import nodemailer, { Transporter } from 'nodemailer';
import logger from '@/services/loggerService';
import { EmailLogService, EmailType } from '@/services/emailLogService';
import { buildSigningUrl, buildDownloadUrl } from '@/utils/urlBuilder';

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
export type EmailConfigProvider = () => Promise<EmailConfig & { baseUrl: string }>;

/**
 * Raw email payload for `EmailService.sendCustomEmail` - used by callers
 * that build their own HTML/text outside the built-in templates.
 */
export interface CustomEmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
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
   * Resolves the transporter/from-address/baseUrl to use for the send that
   * is about to happen. In provider mode this calls the injected provider
   * (e.g. `settingsService.getEmailConfig()`) and builds a fresh transporter
   * every time - avoids ever caching a stale SMTP config. In legacy mode it
   * just returns the values captured at construction.
   */
  private async resolveSendConfig(): Promise<{ transporter: Transporter; fromEmail: string; baseUrl: string }> {
    if (this.configProvider) {
      const config = await this.configProvider();
      return {
        transporter: this.createTransporter(config),
        fromEmail: config.from,
        baseUrl: config.baseUrl,
      };
    }

    return {
      transporter: this.transporter as Transporter,
      fromEmail: this.fromEmail as string,
      baseUrl: this.baseUrl as string,
    };
  }

  /**
   * Internal helper to send email with logging. Resolves config itself
   * unless the caller already resolved it (e.g. because it also needed
   * `baseUrl` - see `sendEmailVerification`), in which case pass it in to
   * avoid a second resolve.
   */
  private async sendWithLogging(
    recipientEmail: string,
    subject: string,
    emailType: EmailType,
    html: string,
    text: string,
    context: EmailContext = {},
    resolved?: { transporter: Transporter; fromEmail: string }
  ): Promise<void> {
    const { transporter, fromEmail } = resolved ?? (await this.resolveSendConfig());
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
      const result = await transporter.sendMail({
        from: fromEmail,
        to: recipientEmail,
        subject,
        text,
        html,
      });

      // Mark as sent with message ID
      if (logId && this.emailLogService) {
        await this.emailLogService.markAsSent(logId, result.messageId);
      }

      logger.debug('Email sent successfully', {
        to: recipientEmail,
        subject,
        emailType,
        messageId: result.messageId,
      });
    } catch (error) {
      // Mark as failed
      if (logId && this.emailLogService) {
        await this.emailLogService.markAsFailed(logId, (error as Error).message);
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

    const html = this.generateSigningRequestHtml(data);
    const text = this.generateSigningRequestText(data);

    const emailType: EmailType = data.isReminder ? 'reminder' : 'signing_request';

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      emailType,
      html,
      text,
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

    const html = this.generateCompletionHtml(data);
    const text = this.generateCompletionText(data);

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'completion',
      html,
      text,
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

    const html = this.generateReminderHtml(data);
    const text = this.generateReminderText(data);

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'reminder',
      html,
      text,
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

    const html = this.generatePasswordChangeHtml(data);
    const text = this.generatePasswordChangeText(data);

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'password_change',
      html,
      text,
      {
        userId: data.userId,
      }
    );
  }

  /**
   * Generate signing request HTML email
   */
  private generateSigningRequestHtml(data: SigningRequestEmailData): string {
    const branding = data.branding || {};
    const companyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const primaryColor = branding.primaryColor || DEFAULT_BRANDING.primaryColor;
    const headerColor = data.isReminder ? '#f59e0b' : primaryColor;
    const buttonColor = data.isReminder ? '#f59e0b' : primaryColor;
    const headerTitle = data.isReminder ? 'Signature Reminder' : 'Signature Request';
    const footerText = branding.footerText || `This is an automated email from ${companyName}. Please do not reply to this email.`;

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
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>${headerTitle}</h1>
            </div>
            <div class="content">
              <p>Hello ${data.recipientName},</p>
              ${data.isReminder
                ? `<p>This is a friendly reminder that <strong>${data.senderName}</strong> is waiting for your signature on the following document:</p>`
                : `<p><strong>${data.senderName}</strong> has requested your signature on the following document:</p>`
              }
              <h3>${data.documentTitle}</h3>
              ${data.isReminder ? '<div class="reminder"><strong>⏰ Action Required:</strong> Please review and sign this document at your earliest convenience.</div>' : ''}
              ${data.message ? `<div class="message"><strong>Message:</strong><br>${data.message}</div>` : ''}
              <p>Please click the button below to review and sign the document:</p>
              <div style="text-align: center;">
                <a href="${data.signingUrl}" class="button">Review & Sign Document</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${data.signingUrl}">${data.signingUrl}</a></div>
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
    const companyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const secondaryColor = branding.secondaryColor || DEFAULT_BRANDING.secondaryColor;
    const footerText = branding.footerText || `This is an automated email from ${companyName}. Please do not reply to this email.`;

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
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>✓ Document Completed</h1>
            </div>
            <div class="content">
              <p>Hello ${data.recipientName},</p>
              <p>Great news! The following document has been fully signed and completed:</p>
              <h3>${data.documentTitle}</h3>
              <div class="info">
                <strong>Completed on:</strong> ${formattedDate}
              </div>
              ${data.downloadUrl ? `
              <p>You can download the signed document using the button below:</p>
              <div style="text-align: center;">
                <a href="${data.downloadUrl}" class="button">Download Document</a>
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
    const companyName = branding.companyName || DEFAULT_BRANDING.companyName;
    const footerText = branding.footerText || `This is an automated email from ${companyName}. Please do not reply to this email.`;
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
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${companyName}" class="logo" />` : ''}
              <h1>Signature Reminder</h1>
            </div>
            <div class="content">
              <p>Hello ${data.recipientName},</p>
              <p>This is a friendly reminder that <strong>${data.senderName}</strong> is waiting for your signature on:</p>
              <h3>${data.documentTitle}</h3>
              <div class="reminder">
                <strong>Waiting for:</strong> ${data.daysWaiting} day${data.daysWaiting !== 1 ? 's' : ''}
              </div>
              <p>Please take a moment to review and sign the document:</p>
              <div style="text-align: center;">
                <a href="${data.signingUrl}" class="button">Sign Document Now</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${data.signingUrl}">${data.signingUrl}</a></div>
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
              <p>Hello ${data.recipientName},</p>
              <p>Your password was successfully changed for your EzSign account.</p>
              <div class="info">
                <strong>Changed on:</strong> ${formattedDate}<br>
                ${data.ipAddress ? `<strong>IP Address:</strong> ${data.ipAddress}<br>` : ''}
              </div>
              <div class="warning">
                <strong>⚠️ Didn't make this change?</strong><br>
                If you did not change your password, someone may have accessed your account. Please reset your password immediately.
                ${data.resetPasswordUrl ? `
                <div style="text-align: center; margin-top: 15px;">
                  <a href="${data.resetPasswordUrl}" class="button">Reset Password</a>
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

    if (branding.supportUrl) {
      links.push(`<a href="${branding.supportUrl}">Support</a>`);
    } else if (branding.supportEmail) {
      links.push(`<a href="mailto:${branding.supportEmail}">Contact Support</a>`);
    }

    if (branding.privacyUrl) {
      links.push(`<a href="${branding.privacyUrl}">Privacy Policy</a>`);
    }

    if (branding.termsUrl) {
      links.push(`<a href="${branding.termsUrl}">Terms of Service</a>`);
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
   * InvitationController.sendInvitationEmail). No email log entry is
   * created here, matching that caller's prior behavior.
   */
  async sendCustomEmail(data: CustomEmailData): Promise<void> {
    const { transporter, fromEmail } = await this.resolveSendConfig();
    await transporter.sendMail({
      from: fromEmail,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: {
    recipientEmail: string;
    recipientName: string;
    verificationToken: string;
    userId?: string;
  }): Promise<void> {
    const resolved = await this.resolveSendConfig();
    const verificationUrl = `${resolved.baseUrl}/verify-email?token=${data.verificationToken}`;
    const subject = 'Verify your email address - EzSign';

    const html = this.generateEmailVerificationHtml(data.recipientName, verificationUrl);
    const text = this.generateEmailVerificationText(data.recipientName, verificationUrl);

    await this.sendWithLogging(
      data.recipientEmail,
      subject,
      'verification',
      html,
      text,
      {
        userId: data.userId,
      },
      { transporter: resolved.transporter, fromEmail: resolved.fromEmail }
    );
  }

  /**
   * Generate email verification HTML
   */
  private generateEmailVerificationHtml(recipientName: string, verificationUrl: string): string {
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
              <p>Hello ${recipientName},</p>
              <p>Thank you for registering with EzSign. To complete your registration and start using our document signing platform, please verify your email address.</p>
              <div class="info">
                <strong>⏰ Important:</strong> This verification link will expire in 24 hours.
              </div>
              <p>Click the button below to verify your email:</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
              <div class="link-box"><a href="${verificationUrl}">${verificationUrl}</a></div>
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
