import { Request, Response } from 'express';
import { Pool } from 'pg';
import { ScheduledSendService } from '@/services/scheduledSendService';
import { SignerService } from '@/services/signerService';
import logger from '@/services/loggerService';

/**
 * Schedule Controller
 * Handles document scheduling endpoints
 */
export class ScheduleController {
  private pool: Pool;
  private scheduledSendService: ScheduledSendService;
  private signerService: SignerService;

  constructor(
    pool: Pool,
    scheduledSendService: ScheduledSendService,
    signerService: SignerService
  ) {
    this.pool = pool;
    this.scheduledSendService = scheduledSendService;
    this.signerService = signerService;
  }

  /**
   * Schedule a document for future sending
   * POST /api/documents/:id/schedule
   */
  scheduleDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const userId = req.user.userId;
      const documentId = req.params.id;

      if (!documentId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      const { sendAt, timezone } = req.body;

      // Validate request body
      if (!sendAt) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'sendAt is required',
        });
        return;
      }

      if (!timezone) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'timezone is required',
        });
        return;
      }

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      const document = docResult.rows[0];

      // Check ownership
      if (document.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to schedule this document',
        });
        return;
      }

      // Check if document can be scheduled (must be draft)
      if (document.status !== 'draft') {
        res.status(400).json({
          error: 'Bad Request',
          message: `Only draft documents can be scheduled. Current status: ${document.status}`,
        });
        return;
      }

      // Validate sendAt is in the future
      const scheduledTime = new Date(sendAt);
      const minTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      if (isNaN(scheduledTime.getTime())) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid sendAt date format',
        });
        return;
      }

      if (scheduledTime < minTime) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Scheduled time must be at least 5 minutes in the future',
        });
        return;
      }

      // Validate not too far in future (30 days max)
      const maxTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (scheduledTime > maxTime) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Scheduled time cannot be more than 30 days in the future',
        });
        return;
      }

      // Check document has signers
      const signers = await this.signerService.getSignersByDocumentId(documentId);
      if (signers.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document must have at least one signer before scheduling',
        });
        return;
      }

      // Check document has fields
      const fieldsResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM fields WHERE document_id = $1',
        [documentId]
      );
      if (parseInt(fieldsResult.rows[0].count, 10) === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document must have at least one field before scheduling',
        });
        return;
      }

      // Check all fields are assigned
      const unassignedResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM fields
         WHERE document_id = $1 AND (signer_email IS NULL OR signer_email = '')`,
        [documentId]
      );
      if (parseInt(unassignedResult.rows[0].count, 10) > 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'All fields must be assigned to signers before scheduling',
        });
        return;
      }

      // Schedule the document
      const result = await this.scheduledSendService.scheduleDocumentSend(
        documentId,
        userId,
        scheduledTime,
        timezone
      );

      logger.info('Document scheduled for sending', {
        documentId,
        scheduledAt: scheduledTime.toISOString(),
        timezone,
        jobId: result.jobId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Document scheduled for sending',
        documentId,
        status: 'scheduled',
        scheduledSendAt: scheduledTime.toISOString(),
        timezone,
        jobId: result.jobId,
      });
    } catch (error) {
      logger.error('Failed to schedule document', {
        documentId: req.params.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to schedule document',
      });
    }
  };

  /**
   * Cancel a scheduled send
   * DELETE /api/documents/:id/schedule
   */
  cancelScheduledSend = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const userId = req.user.userId;
      const documentId = req.params.id;

      if (!documentId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Get document
      const docResult = await this.pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      const document = docResult.rows[0];

      // Check ownership
      if (document.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to modify this document',
        });
        return;
      }

      // Check if document is scheduled
      if (document.status !== 'scheduled') {
        res.status(400).json({
          error: 'Bad Request',
          message: `Document is not scheduled. Current status: ${document.status}`,
        });
        return;
      }

      // Cancel the scheduled send
      await this.scheduledSendService.cancelScheduledSend(documentId);

      logger.info('Scheduled send cancelled', {
        documentId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Scheduled send cancelled',
        documentId,
        status: 'draft',
      });
    } catch (error) {
      logger.error('Failed to cancel scheduled send', {
        documentId: req.params.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to cancel scheduled send',
      });
    }
  };

  /**
   * Get schedule status for a document
   * GET /api/documents/:id/schedule
   */
  getScheduleStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const documentId = req.params.id;

      if (!documentId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Document ID is required',
        });
        return;
      }

      // Get document
      const docResult = await this.pool.query(
        `SELECT id, status, scheduled_send_at, scheduled_timezone, schedule_job_id
         FROM documents WHERE id = $1`,
        [documentId]
      );

      if (docResult.rows.length === 0) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      const document = docResult.rows[0];

      if (document.status !== 'scheduled') {
        res.status(200).json({
          documentId,
          isScheduled: false,
          status: document.status,
        });
        return;
      }

      res.status(200).json({
        documentId,
        isScheduled: true,
        status: document.status,
        scheduledSendAt: document.scheduled_send_at,
        timezone: document.scheduled_timezone,
        jobId: document.schedule_job_id,
      });
    } catch (error) {
      logger.error('Failed to get schedule status', {
        documentId: req.params.id,
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get schedule status',
      });
    }
  };
}
