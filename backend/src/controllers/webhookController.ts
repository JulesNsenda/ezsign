import { Request, Response } from 'express';
import { Pool } from 'pg';
import { WebhookService } from '@/services/webhookService';
import { Webhook } from '@/models/Webhook';
import { AuthenticatedRequest } from '@/middleware/auth';
import logger from '@/services/loggerService';

export class WebhookController {
  private webhookService: WebhookService;
  private pool: Pool;

  constructor(pool: Pool) {
    this.webhookService = new WebhookService(pool);
    this.pool = pool;
  }

  /**
   * Create a new webhook
   * POST /api/webhooks
   */
  createWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { url, events, secret } = req.body;

      // Validate required fields
      if (!url || !events || !Array.isArray(events) || events.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'URL and at least one event are required',
        });
        return;
      }

      // Validate URL format
      if (!Webhook.isValidUrl(url)) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid URL format',
        });
        return;
      }

      // Validate HTTPS requirement (allow HTTP only for localhost in development)
      const urlObj = new URL(url);
      const isDevelopment = process.env.NODE_ENV === 'development';
      const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';

      if (urlObj.protocol === 'http:' && !(isDevelopment && isLocalhost)) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'HTTPS is required for webhook URLs (HTTP only allowed for localhost in development)',
        });
        return;
      }

      // Validate URL security - prevent SSRF attacks
      if (this.isPrivateIp(urlObj.hostname)) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Webhook URL cannot point to private IP addresses',
        });
        return;
      }

      // Validate events array
      const validEvents = [
        'document.created',
        'document.sent',
        'document.viewed',
        'document.signed',
        'document.completed',
        'document.cancelled',
        'template.created',
        'signer.declined',
      ];

      const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid events: ${invalidEvents.join(', ')}. Valid events: ${validEvents.join(', ')}`,
        });
        return;
      }

      // Check max events per webhook (20)
      if (events.length > 20) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Maximum 20 events allowed per webhook',
        });
        return;
      }

      // Check max webhooks per user (10)
      const existingWebhooks = await this.webhookService.getWebhooks(authenticatedReq.user.userId);
      if (existingWebhooks.length >= 10) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Maximum 10 webhooks allowed per user',
        });
        return;
      }

      // Create webhook
      const webhook = await this.webhookService.createWebhook({
        user_id: authenticatedReq.user.userId,
        url,
        events,
        secret,
      });

      res.status(201).json({
        success: true,
        data: webhook.toPublicJSON(),
      });
    } catch (error) {
      logger.error('Create webhook error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to create webhook: ${message}`,
      });
    }
  };

  /**
   * Get all webhooks for the authenticated user
   * GET /api/webhooks
   */
  getWebhooks = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { active } = req.query;

      // Get all webhooks for user
      let webhooks = await this.webhookService.getWebhooks(authenticatedReq.user.userId);

      // Apply active filter if provided
      if (active !== undefined) {
        const isActive = active === 'true';
        webhooks = webhooks.filter((w) => w.active === isActive);
      }

      res.status(200).json({
        success: true,
        data: webhooks.map((w) => w.toPublicJSON()),
      });
    } catch (error) {
      logger.error('Get webhooks error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to retrieve webhooks: ${message}`,
      });
    }
  };

  /**
   * Get a single webhook by ID
   * GET /api/webhooks/:id
   */
  getWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Webhook ID is required',
        });
        return;
      }

      const webhook = await this.webhookService.getWebhookById(id);

      if (!webhook) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Webhook not found',
        });
        return;
      }

      // Verify ownership
      if (webhook.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to access this webhook',
        });
        return;
      }

      // Get delivery statistics
      const stats = await this.getWebhookStats(id);

      res.status(200).json({
        success: true,
        data: {
          ...webhook.toPublicJSON(),
          stats,
        },
      });
    } catch (error) {
      logger.error('Get webhook error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to retrieve webhook: ${message}`,
      });
    }
  };

  /**
   * Update a webhook
   * PUT /api/webhooks/:id
   */
  updateWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;
      const { url, events, active } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Webhook ID is required',
        });
        return;
      }

      // Verify webhook exists and user owns it
      const existingWebhook = await this.webhookService.getWebhookById(id);
      if (!existingWebhook) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Webhook not found',
        });
        return;
      }

      if (existingWebhook.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to update this webhook',
        });
        return;
      }

      // Validate URL if provided
      if (url !== undefined) {
        if (!Webhook.isValidUrl(url)) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Invalid URL format',
          });
          return;
        }

        const urlObj = new URL(url);
        const isDevelopment = process.env.NODE_ENV === 'development';
        const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';

        if (urlObj.protocol === 'http:' && !(isDevelopment && isLocalhost)) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'HTTPS is required for webhook URLs',
          });
          return;
        }

        if (this.isPrivateIp(urlObj.hostname)) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Webhook URL cannot point to private IP addresses',
          });
          return;
        }
      }

      // Validate events if provided
      if (events !== undefined) {
        if (!Array.isArray(events) || events.length === 0) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Events must be a non-empty array',
          });
          return;
        }

        const validEvents = [
          'document.created',
          'document.sent',
          'document.viewed',
          'document.signed',
          'document.completed',
          'document.cancelled',
          'template.created',
          'signer.declined',
        ];

        const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: `Invalid events: ${invalidEvents.join(', ')}`,
          });
          return;
        }

        if (events.length > 20) {
          res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Maximum 20 events allowed per webhook',
          });
          return;
        }
      }

      // Update webhook
      const updatedWebhook = await this.webhookService.updateWebhook(id, authenticatedReq.user.userId, {
        url,
        events,
        active,
      });

      res.status(200).json({
        success: true,
        data: updatedWebhook.toPublicJSON(),
      });
    } catch (error) {
      logger.error('Update webhook error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to update webhook: ${message}`,
      });
    }
  };

  /**
   * Delete a webhook (soft delete)
   * DELETE /api/webhooks/:id
   */
  deleteWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Webhook ID is required',
        });
        return;
      }

      // Verify webhook exists and user owns it
      const webhook = await this.webhookService.getWebhookById(id);
      if (!webhook) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Webhook not found',
        });
        return;
      }

      if (webhook.user_id !== authenticatedReq.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to delete this webhook',
        });
        return;
      }

      // Delete webhook
      await this.webhookService.deleteWebhook(id, authenticatedReq.user.userId);

      res.status(200).json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      logger.error('Delete webhook error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: `Failed to delete webhook: ${message}`,
      });
    }
  };

  /**
   * Check if hostname is a private IP address (SSRF prevention)
   */
  private isPrivateIp(hostname: string): boolean {
    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return process.env.NODE_ENV !== 'development';
    }

    // Check for private IP ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);

    if (match) {
      const [, a, b, _c, _d] = match.map(Number);

      // Private IP ranges
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    }

    return false;
  }

  /**
   * Get webhook delivery statistics
   */
  private async getWebhookStats(webhookId: string): Promise<{
    total_deliveries: number;
    successful_deliveries: number;
    failed_deliveries: number;
    pending_deliveries: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_deliveries,
        COUNT(*) FILTER (WHERE status = 'delivered') as successful_deliveries,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_deliveries,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_deliveries
       FROM webhook_events
       WHERE webhook_id = $1`,
      [webhookId]
    );

    const stats = result.rows[0];
    return {
      total_deliveries: parseInt(stats.total_deliveries) || 0,
      successful_deliveries: parseInt(stats.successful_deliveries) || 0,
      failed_deliveries: parseInt(stats.failed_deliveries) || 0,
      pending_deliveries: parseInt(stats.pending_deliveries) || 0,
    };
  }
}
