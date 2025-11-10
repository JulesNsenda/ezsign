import nodemailer, { Transporter } from 'nodemailer';

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

export interface SigningRequestEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  senderName: string;
  signingUrl: string;
  message?: string;
  isReminder?: boolean;
}

export interface CompletionEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  completedAt: Date;
  downloadUrl?: string;
}

export interface ReminderEmailData {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  senderName: string;
  signingUrl: string;
  daysWaiting: number;
}

export interface PasswordChangeEmailData {
  recipientEmail: string;
  recipientName: string;
  changedAt: Date;
  ipAddress?: string;
  resetPasswordUrl?: string;
}

export class EmailService {
  private transporter: Transporter;
  private fromEmail: string;
  private baseUrl: string;

  constructor(config: EmailConfig, baseUrl: string) {
    this.transporter = nodemailer.createTransport({
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
    this.fromEmail = config.from;
    this.baseUrl = baseUrl;
  }

  /**
   * Send signing request email
   */
  async sendSigningRequest(data: SigningRequestEmailData): Promise<void> {
    const baseSubject = `${data.senderName} has requested your signature on "${data.documentTitle}"`;
    const subject = data.isReminder ? `Reminder: ${baseSubject}` : baseSubject;

    const html = this.generateSigningRequestHtml(data);
    const text = this.generateSigningRequestText(data);

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
  }

  /**
   * Send document completion notification
   */
  async sendCompletionNotification(data: CompletionEmailData): Promise<void> {
    const subject = `Document "${data.documentTitle}" has been completed`;

    const html = this.generateCompletionHtml(data);
    const text = this.generateCompletionText(data);

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
  }

  /**
   * Send reminder email
   */
  async sendReminder(data: ReminderEmailData): Promise<void> {
    const subject = `Reminder: Please sign "${data.documentTitle}"`;

    const html = this.generateReminderHtml(data);
    const text = this.generateReminderText(data);

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
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

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
  }

  /**
   * Generate signing request HTML email
   */
  private generateSigningRequestHtml(data: SigningRequestEmailData): string {
    const headerColor = data.isReminder ? '#f59e0b' : '#4F46E5';
    const buttonColor = data.isReminder ? '#f59e0b' : '#4F46E5';
    const headerTitle = data.isReminder ? 'Signature Reminder' : 'Signature Request';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; }
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
            .message { background-color: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .reminder { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
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
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${data.signingUrl}">${data.signingUrl}</a></p>
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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #10b981;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .info { background-color: #d1fae5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
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
              <p>This is an automated email from EzSign. Please do not reply to this email.</p>
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
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f59e0b; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #f59e0b;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            .reminder { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
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
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${data.signingUrl}">${data.signingUrl}</a></p>
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
   * Verify email configuration
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service verification failed:', error);
      return false;
    }
  }

  /**
   * Generate signing URL for a signer
   */
  generateSigningUrl(accessToken: string): string {
    return `${this.baseUrl}/sign/${accessToken}`;
  }

  /**
   * Generate document download URL
   */
  generateDownloadUrl(documentId: string): string {
    return `${this.baseUrl}/api/documents/${documentId}/download`;
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: {
    recipientEmail: string;
    recipientName: string;
    verificationToken: string;
  }): Promise<void> {
    const verificationUrl = `${this.baseUrl}/verify-email?token=${data.verificationToken}`;
    const subject = 'Verify your email address - EzSign';

    const html = this.generateEmailVerificationHtml(data.recipientName, verificationUrl);
    const text = this.generateEmailVerificationText(data.recipientName, verificationUrl);

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
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
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
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
