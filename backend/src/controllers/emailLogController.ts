/**
 * Email Log Controller
 *
 * Handles API requests for email delivery tracking
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import { createEmailLogService, EmailLogFilter, PublicEmailLog } from '@/services/emailLogService';
import { validatePaginationParams } from '@/utils/pagination';
import { categorizeSmtpError } from '@/utils/smtpErrorCategorizer';
import logger from '@/services/loggerService';

/**
 * Parses a `page` query param, clamping to >= 1. `parseInt` of a missing or
 * non-numeric value produces NaN (falls through to 1), and a negative or
 * zero page (e.g. `?page=0`) is normalized to 1 rather than producing a
 * negative Postgres OFFSET.
 */
function parsePageParam(value: unknown): number {
  const parsed = parseInt(value as string, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Parses a `pageSize` query param via `validatePaginationParams`, which
 * caps the upper bound (`?pageSize=10000000` no longer pulls the table
 * into memory). `validatePaginationParams()` only substitutes its default
 * for a literal `undefined` - parseInt() of a missing query param produces
 * NaN, not undefined, so that has to be normalized here first.
 */
function parsePageSizeParam(value: unknown): number {
  const parsed = parseInt(value as string, 10);
  return validatePaginationParams(Number.isFinite(parsed) ? parsed : undefined, 100, 20);
}

/** G7: reject an inbound webhook whose `X-Webhook-Timestamp` is older/newer than this. */
const MAX_WEBHOOK_SKEW_MS = 5 * 60 * 1000;

/**
 * Verifies the HMAC-SHA256 signature of an inbound email delivery status
 * webhook against `WEBHOOK_SECRET`. Requires the raw request body bytes -
 * `req.rawBody`, captured by the `verify` callback on the dedicated JSON
 * parser mounted ahead of this route in `server.ts` (`middleware/rawBody.ts`)
 * - since a re-serialized `JSON.stringify(req.body)` is not guaranteed to
 * match the bytes the sender actually signed.
 *
 * G7: the signature is computed over `${timestamp}.${rawBody}` (the literal
 * `X-Webhook-Timestamp` header string, a `.` separator, then the raw body
 * bytes) - not the body alone. The HMAC previously signed only the body, so
 * a captured `(body, signature)` pair could replay indefinitely to re-flip a
 * row's status. Binding the signature to a timestamp and rejecting anything
 * older than `MAX_WEBHOOK_SKEW_MS` bounds how long a captured pair stays
 * usable. `X-Webhook-Timestamp` is **milliseconds since the Unix epoch**
 * (`Date.now()`'s unit, checked directly against it below) - NOT seconds
 * (Stripe/Svix-style), so a sender integrating against this endpoint must
 * send milliseconds or every request will fail the skew check.
 */
function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader || !timestampHeader) {
    return false;
  }

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_WEBHOOK_SKEW_MS) {
    return false;
  }

  const signedPayload = Buffer.concat([Buffer.from(`${timestampHeader}.`, 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signatureHeader, 'utf8');

  // timingSafeEqual throws on a length mismatch rather than returning
  // false, so that has to be checked first.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export class EmailLogController {
  private emailLogService: ReturnType<typeof createEmailLogService>;

  constructor(pool: Pool) {
    this.emailLogService = createEmailLogService(pool);
  }

  /**
   * Whether the caller may see raw SMTP error text - instance admins only.
   * `error_message` describes the *instance's* SMTP transport (host, port,
   * auth username), not anything document-scoped, so document ownership
   * doesn't earn it: on a multi-user instance any user can upload a
   * document, add a signer at a nonexistent domain, send, and read back the
   * instance's SMTP host and username via this endpoint otherwise. Everyone
   * else with access to the document (owner or team member alike) gets the
   * categorized string.
   */
  private canSeeRawError(role: string): boolean {
    return role === 'admin';
  }

  /**
   * Applies the categorized-vs-raw error split to a page of public email
   * logs in place of the raw `error_message`.
   */
  private redactErrors(logs: PublicEmailLog[]): PublicEmailLog[] {
    return logs.map((log) =>
      log.errorMessage ? { ...log, errorMessage: categorizeSmtpError(log.errorMessage) } : log,
    );
  }

  /**
   * Get email logs for a specific document
   * GET /api/documents/:id/emails
   */
  getDocumentEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      const page = parsePageParam(req.query.page);
      const pageSize = parsePageSizeParam(req.query.pageSize);

      const result = await this.emailLogService.getByDocumentId(documentId, page, pageSize);

      const canSeeRaw = req.user ? this.canSeeRawError(req.user.role) : false;

      res.json({
        ...result,
        logs: canSeeRaw ? result.logs : this.redactErrors(result.logs),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get email statistics for a document
   * GET /api/documents/:id/emails/stats
   */
  getDocumentEmailStats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      const stats = await this.emailLogService.getDocumentEmailStats(documentId);

      res.json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all email logs (admin only)
   * GET /api/admin/emails
   */
  getAllEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parsePageParam(req.query.page);
      const pageSize = parsePageSizeParam(req.query.pageSize);

      const filter: EmailLogFilter = {};

      // Optional filters from query params
      if (req.query.documentId) {
        filter.documentId = req.query.documentId as string;
      }
      if (req.query.signerId) {
        filter.signerId = req.query.signerId as string;
      }
      if (req.query.userId) {
        filter.userId = req.query.userId as string;
      }
      if (req.query.recipientEmail) {
        filter.recipientEmail = req.query.recipientEmail as string;
      }
      if (req.query.emailType) {
        filter.emailType = req.query.emailType as EmailLogFilter['emailType'];
      }
      if (req.query.status) {
        filter.status = req.query.status as EmailLogFilter['status'];
      }
      if (req.query.startDate) {
        filter.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filter.endDate = new Date(req.query.endDate as string);
      }

      const result = await this.emailLogService.queryLogs(filter, page, pageSize);

      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get a specific email log by ID
   * GET /api/admin/emails/:id
   */
  getEmailById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: 'Email log ID is required' });
        return;
      }

      const emailLog = await this.emailLogService.getById(id);

      if (!emailLog) {
        res.status(404).json({
          error: 'Not found',
          message: 'Email log not found',
        });
        return;
      }

      res.json(emailLog);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Resend an email (admin only)
   * POST /api/admin/emails/:id/resend
   */
  resendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: 'Email log ID is required' });
        return;
      }

      const emailLog = await this.emailLogService.getById(id);

      if (!emailLog) {
        res.status(404).json({
          error: 'Not found',
          message: 'Email log not found',
        });
        return;
      }

      // For now, return an error - resend functionality requires
      // storing the email content or regenerating from template
      // This is a placeholder for future implementation
      logger.info('Email resend requested', {
        emailLogId: id,
        emailType: emailLog.emailType,
        userId: (req as any).user?.id,
      });

      res.status(501).json({
        error: 'Not implemented',
        message:
          'Email resend functionality requires additional implementation. Original email content is not stored.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Webhook handler for email delivery status updates
   * POST /api/webhooks/email-status
   * This can be called by email service providers (SendGrid, Mailgun, etc.)
   *
   * HMAC-SHA256-gated: a recipient knows their own Message-ID, so without a
   * signature check they could flip their own `email_logs` row to
   * `failed`/`bounced` with an attacker-chosen error string, or to
   * `delivered`/`opened` to fake receipt - forging the delivery evidence
   * this feature exists to display. Fails closed if `WEBHOOK_SECRET` is
   * unset, since there is then nothing to verify against. The signature is
   * additionally bound to an `X-Webhook-Timestamp` (G7) - without it, a
   * captured `(body, signature)` pair would replay indefinitely.
   */
  handleDeliveryWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const secret = process.env.WEBHOOK_SECRET;
      if (!secret) {
        logger.warn(
          'Email delivery webhook rejected: WEBHOOK_SECRET is not configured, failing closed',
        );
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const signatureHeader = req.headers['x-webhook-signature'] as string | undefined;
      const timestampHeader = req.headers['x-webhook-timestamp'] as string | undefined;
      if (!verifyWebhookSignature(req.rawBody, signatureHeader, timestampHeader, secret)) {
        logger.warn('Email delivery webhook rejected: missing, invalid, or stale-timestamped signature');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid webhook signature',
        });
        return;
      }

      const { messageId, status, error: rawError } = req.body;

      if (!messageId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'messageId is required',
        });
        return;
      }

      // The inbound error field is untyped `req.body` - coerce and cap it
      // before it is written to the database.
      const error =
        rawError === undefined || rawError === null ? undefined : String(rawError).slice(0, 1000);

      const emailLog = await this.emailLogService.getByMessageId(messageId);

      if (!emailLog) {
        // Email not found - this could be from a different system
        logger.debug('Email webhook received for unknown message', { messageId });
        res.status(200).json({ received: true });
        return;
      }

      // Update status based on webhook event
      switch (status) {
        case 'delivered':
          await this.emailLogService.markAsDelivered(emailLog.id);
          break;
        case 'bounced':
        case 'bounce':
          await this.emailLogService.markAsBounced(emailLog.id, error);
          break;
        case 'failed':
        case 'dropped':
          await this.emailLogService.markAsFailed(emailLog.id, error || 'Delivery failed');
          break;
        case 'opened':
        case 'open':
          await this.emailLogService.markAsOpened(emailLog.id);
          break;
        default:
          logger.debug('Unknown email status received', { messageId, status });
      }

      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get the email log service instance (for use by other controllers)
   */
  getService(): ReturnType<typeof createEmailLogService> {
    return this.emailLogService;
  }
}
