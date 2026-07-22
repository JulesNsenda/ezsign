import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';
import { getSettingsService, SettingsService, SettingsValidationError } from '@/services/settingsService';
import { putSettingsSchema } from '@/validators/settingsSchemas';
import logger from '@/services/loggerService';

/**
 * Builds the read-only `system` block returned alongside settings - static
 * facts about the deployment that aren't stored in `instance_settings`.
 */
function getSystemInfo() {
  return {
    storagePath: process.env.FILE_STORAGE_PATH || './storage',
    redisConfigured: !!process.env.REDIS_URL,
    databaseConfigured: true,
  };
}

/**
 * Categorizes an SMTP send failure into one of a small set of safe,
 * non-identifying messages. The raw error (which can include host/port/
 * credential-adjacent details) is logged server-side only - never returned
 * in the API response.
 */
function categorizeSmtpError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const code = (error as { code?: string } | undefined)?.code;

  if (code === 'EAUTH' || message.includes('auth') || message.includes('invalid login')) {
    return 'Authentication failed';
  }
  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ESOCKET' ||
    message.includes('connect') ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'SMTP connection failed';
  }
  return 'Failed to send test email';
}

export class AdminSettingsController {
  private settingsService: SettingsService;

  constructor(pool: Pool) {
    this.settingsService = getSettingsService(pool);
  }

  /**
   * GET /api/admin/settings
   */
  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.settingsService.getAll();
      res.json({
        success: true,
        data: { settings, system: getSystemInfo() },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/admin/settings
   */
  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = putSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'Invalid request body',
          },
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      await this.settingsService.set(parsed.data.settings, req.user.userId, req.ip);

      const settings = await this.settingsService.getAll();
      res.json({
        success: true,
        data: { settings, system: getSystemInfo() },
      });
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: error.message },
        });
        return;
      }
      next(error);
    }
  };

  /**
   * POST /api/admin/settings/test-email
   * Sends a test email to the calling admin's own address using a one-off
   * transporter built from the current effective SMTP config. Does not
   * import EmailService (owned by a concurrent refactor).
   */
  testEmail = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    try {
      const config = await this.settingsService.getEmailConfig();

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.auth && { auth: config.auth }),
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      await transporter.sendMail({
        from: config.from,
        to: req.user.email,
        subject: 'EzSign test email',
        text: 'This is a test email from your EzSign instance settings.\n\nIf you received this, SMTP is configured correctly.',
        html:
          '<p>This is a test email from your EzSign instance settings.</p>' +
          '<p>If you received this, SMTP is configured correctly.</p>',
      });

      res.json({
        success: true,
        data: { message: `Test email sent to ${req.user.email}` },
      });
    } catch (error) {
      logger.error('Instance settings test email failed', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });

      res.status(502).json({
        success: false,
        error: { code: 'TEST_EMAIL_FAILED', message: categorizeSmtpError(error) },
      });
    }
  };
}
