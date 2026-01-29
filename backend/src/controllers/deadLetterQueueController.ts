import { Request, Response } from 'express';
import { Pool } from 'pg';
import {
  DeadLetterQueueService,
  DLQStatus,
  DLQListOptions,
} from '@/services/deadLetterQueueService';
import logger from '@/services/loggerService';

/**
 * Dead Letter Queue Controller
 * Admin endpoints for managing failed jobs
 */
export class DeadLetterQueueController {
  private dlqService: DeadLetterQueueService;

  constructor(pool: Pool) {
    this.dlqService = new DeadLetterQueueService(pool);
  }

  /**
   * List DLQ entries with filtering and pagination
   * GET /api/admin/dlq
   */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        queue,
        status,
        limit = '50',
        offset = '0',
        sortBy = 'failed_at',
        sortOrder = 'desc',
      } = req.query;

      const options: DLQListOptions = {
        queueName: queue as string | undefined,
        status: status as DLQStatus | undefined,
        limit: Math.min(parseInt(limit as string, 10) || 50, 100),
        offset: parseInt(offset as string, 10) || 0,
        sortBy: (sortBy as DLQListOptions['sortBy']) || 'failed_at',
        sortOrder: (sortOrder as DLQListOptions['sortOrder']) || 'desc',
      };

      const { entries, total } = await this.dlqService.list(options);

      res.json({
        success: true,
        data: {
          entries,
          pagination: {
            total,
            limit: options.limit,
            offset: options.offset,
            hasMore: (options.offset ?? 0) + entries.length < total,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to list DLQ entries', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to list failed jobs',
      });
    }
  };

  /**
   * Get DLQ statistics
   * GET /api/admin/dlq/stats
   */
  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.dlqService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get DLQ stats', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
      });
    }
  };

  /**
   * Get a single DLQ entry by ID
   * GET /api/admin/dlq/:id
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID is required',
        });
        return;
      }

      const entry = await this.dlqService.getById(id);

      if (!entry) {
        res.status(404).json({
          success: false,
          error: 'Entry not found',
        });
        return;
      }

      res.json({
        success: true,
        data: entry,
      });
    } catch (error) {
      logger.error('Failed to get DLQ entry', {
        error: (error as Error).message,
        id: req.params.id,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get entry',
      });
    }
  };

  /**
   * Retry a single failed job
   * POST /api/admin/dlq/:id/retry
   */
  retryJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID is required',
        });
        return;
      }

      const result = await this.dlqService.retryJob(id);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Job queued for retry',
        data: {
          newJobId: result.newJobId,
        },
      });
    } catch (error) {
      logger.error('Failed to retry DLQ job', {
        error: (error as Error).message,
        id: req.params.id,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retry job',
      });
    }
  };

  /**
   * Retry multiple failed jobs
   * POST /api/admin/dlq/retry-batch
   */
  retryBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          error: 'ids must be a non-empty array',
        });
        return;
      }

      if (ids.length > 50) {
        res.status(400).json({
          success: false,
          error: 'Maximum 50 jobs can be retried at once',
        });
        return;
      }

      const result = await this.dlqService.retryBatch(ids);

      res.json({
        success: true,
        message: `${result.succeeded.length} jobs queued for retry`,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to retry DLQ batch', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retry jobs',
      });
    }
  };

  /**
   * Discard a single failed job
   * POST /api/admin/dlq/:id/discard
   */
  discardJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID is required',
        });
        return;
      }

      const success = await this.dlqService.discardJob(id);

      if (!success) {
        res.status(400).json({
          success: false,
          error: 'Could not discard job (not found or already processed)',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Job discarded',
      });
    } catch (error) {
      logger.error('Failed to discard DLQ job', {
        error: (error as Error).message,
        id: req.params.id,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to discard job',
      });
    }
  };

  /**
   * Discard multiple failed jobs
   * POST /api/admin/dlq/discard-batch
   */
  discardBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          error: 'ids must be a non-empty array',
        });
        return;
      }

      if (ids.length > 100) {
        res.status(400).json({
          success: false,
          error: 'Maximum 100 jobs can be discarded at once',
        });
        return;
      }

      const count = await this.dlqService.discardBatch(ids);

      res.json({
        success: true,
        message: `${count} jobs discarded`,
        data: { count },
      });
    } catch (error) {
      logger.error('Failed to discard DLQ batch', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to discard jobs',
      });
    }
  };

  /**
   * Cleanup old resolved/discarded entries
   * POST /api/admin/dlq/cleanup
   */
  cleanup = async (req: Request, res: Response): Promise<void> => {
    try {
      const { olderThanDays = 30 } = req.body;

      const days = Math.max(1, Math.min(365, parseInt(olderThanDays, 10) || 30));

      const count = await this.dlqService.cleanup(days);

      res.json({
        success: true,
        message: `Cleaned up ${count} old entries`,
        data: { count, olderThanDays: days },
      });
    } catch (error) {
      logger.error('Failed to cleanup DLQ', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup',
      });
    }
  };

  /**
   * Get available queue names for filtering
   * GET /api/admin/dlq/queues
   */
  getQueueNames = async (req: Request, res: Response): Promise<void> => {
    try {
      const queues = await this.dlqService.getQueueNames();

      res.json({
        success: true,
        data: { queues },
      });
    } catch (error) {
      logger.error('Failed to get queue names', {
        error: (error as Error).message,
        correlationId: req.correlationId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get queue names',
      });
    }
  };
}

/**
 * Create DLQ controller instance
 */
export const createDeadLetterQueueController = (pool: Pool): DeadLetterQueueController => {
  return new DeadLetterQueueController(pool);
};
