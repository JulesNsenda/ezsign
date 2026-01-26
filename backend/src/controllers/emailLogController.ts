/**
 * Email Log Controller
 *
 * Handles API requests for email delivery tracking
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createEmailLogService, EmailLogFilter } from '@/services/emailLogService';
import logger from '@/services/loggerService';

export class EmailLogController {
  private emailLogService: ReturnType<typeof createEmailLogService>;

  constructor(pool: Pool) {
    this.emailLogService = createEmailLogService(pool);
  }

  /**
   * Get email logs for a specific document
   * GET /api/documents/:id/emails
   */
  getDocumentEmails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        res.status(400).json({ error: 'Document ID is required' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await this.emailLogService.getByDocumentId(
        documentId,
        page,
        pageSize
      );

      res.json(result);
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
    next: NextFunction
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
   * Get email logs for a specific signer
   * GET /api/signers/:id/emails
   */
  getSignerEmails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const signerId = req.params.id;
      if (!signerId) {
        res.status(400).json({ error: 'Signer ID is required' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await this.emailLogService.getBySignerId(
        signerId,
        page,
        pageSize
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all email logs (admin only)
   * GET /api/admin/emails
   */
  getAllEmails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

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
  getEmailById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
  resendEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
        message: 'Email resend functionality requires additional implementation. Original email content is not stored.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Webhook handler for email delivery status updates
   * POST /api/webhooks/email-status
   * This can be called by email service providers (SendGrid, Mailgun, etc.)
   */
  handleDeliveryWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { messageId, status, error } = req.body;

      if (!messageId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'messageId is required',
        });
        return;
      }

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
