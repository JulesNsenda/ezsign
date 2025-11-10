/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import { Pool } from 'pg';
import crypto from 'crypto';
import axios from 'axios';
import {
  Webhook,
  WebhookData,
  WebhookEvent,
  WebhookEventData,
  CreateWebhookData,
  UpdateWebhookData,
} from '@/models/Webhook';
import { createQueue, QueueName } from '@/config/queue';
import { WebhookJobData } from '@/workers/webhookWorker';

export class WebhookService {
  private pool: Pool;
  private queue;

  constructor(pool: Pool) {
    this.pool = pool;
    this.queue = createQueue(QueueName.WEBHOOK_DELIVERY);
  }

  /**
   * Create a webhook
   */
  async createWebhook(data: CreateWebhookData): Promise<Webhook> {
    const secret = data.secret || Webhook.generateSecret();

    const result = await this.pool.query(
      `INSERT INTO webhooks (user_id, url, events, secret, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.url, data.events, secret, data.active ?? true],
    );

    return new Webhook(this.mapRowToWebhookData(result.rows[0]));
  }

  /**
   * Get webhooks for a user
   */
  async getWebhooks(userId: string): Promise<Webhook[]> {
    const result = await this.pool.query(
      'SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return result.rows.map((row) => new Webhook(this.mapRowToWebhookData(row)));
  }

  /**
   * Get webhook by ID
   */
  async getWebhookById(webhookId: string): Promise<Webhook | null> {
    const result = await this.pool.query('SELECT * FROM webhooks WHERE id = $1', [webhookId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Webhook(this.mapRowToWebhookData(result.rows[0]));
  }

  /**
   * Update webhook
   */
  async updateWebhook(
    webhookId: string,
    userId: string,
    data: UpdateWebhookData,
  ): Promise<Webhook> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(data.url);
    }
    if (data.events !== undefined) {
      updates.push(`events = $${paramIndex++}`);
      values.push(data.events);
    }
    if (data.active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(data.active);
    }

    if (updates.length === 0) {
      const webhook = await this.getWebhookById(webhookId);
      if (!webhook) throw new Error('Webhook not found');
      return webhook;
    }

    values.push(webhookId, userId);

    const result = await this.pool.query(
      `UPDATE webhooks SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error('Webhook not found or access denied');
    }

    return new Webhook(this.mapRowToWebhookData(result.rows[0]));
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2', [
      webhookId,
      userId,
    ]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Trigger webhook event (queue for background delivery)
   * This method finds all active webhooks listening to the event type and queues them for delivery
   */
  async trigger(userId: string, eventType: string, payload: Record<string, any>): Promise<void> {
    // Find all active webhooks for this user that listen to this event type
    const webhooks = await this.getWebhooks(userId);
    const activeWebhooks = webhooks.filter((w) => w.isActive() && w.listensToEvent(eventType));

    if (activeWebhooks.length === 0) {
      console.log(`No active webhooks found for user ${userId} and event ${eventType}`);
      return;
    }

    console.log(`Triggering ${activeWebhooks.length} webhooks for event ${eventType}`);

    // Create webhook event records and queue for delivery
    for (const webhook of activeWebhooks) {
      try {
        // Create webhook event record
        const result = await this.pool.query(
          `INSERT INTO webhook_events (webhook_id, event_type, payload, status, attempts)
           VALUES ($1, $2, $3, 'pending', 0)
           RETURNING id`,
          [webhook.id, eventType, JSON.stringify(payload)],
        );

        const eventId = result.rows[0].id;

        // Queue for background delivery
        await this.queue.add('deliver-webhook', {
          eventId,
        } as WebhookJobData);

        console.log(`✓ Queued webhook event ${eventId} for delivery`);
      } catch (error) {
        console.error(`✗ Failed to queue webhook ${webhook.id} for event ${eventType}:`, error);
      }
    }
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Deliver webhook event
   */
  async deliverWebhook(
    webhook: Webhook,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    if (!webhook.isActive() || !webhook.listensToEvent(eventType)) {
      return;
    }

    // Create webhook event record
    const webhookEvent = await this.createWebhookEvent(webhook.id, eventType, payload);

    try {
      const payloadString = JSON.stringify(payload);
      const signature = this.generateSignature(payloadString, webhook.secret);

      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
        },
        timeout: 10000, // 10 second timeout
      });

      // Mark as delivered
      await this.markWebhookEventDelivered(
        webhookEvent.id,
        response.status,
        response.data ? JSON.stringify(response.data).substring(0, 1000) : null,
      );
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const responseStatus = error.response?.status || null;

      // Mark as failed and calculate next retry
      await this.markWebhookEventFailed(webhookEvent.id, responseStatus, errorMessage);
    }
  }

  /**
   * Create webhook event
   */
  private async createWebhookEvent(
    webhookId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<WebhookEvent> {
    const result = await this.pool.query(
      `INSERT INTO webhook_events (webhook_id, event_type, payload, status, attempts)
       VALUES ($1, $2, $3, 'pending', 1)
       RETURNING *`,
      [webhookId, eventType, JSON.stringify(payload)],
    );

    return new WebhookEvent(this.mapRowToWebhookEventData(result.rows[0]));
  }

  /**
   * Mark webhook event as delivered
   */
  private async markWebhookEventDelivered(
    eventId: string,
    responseStatus: number,
    responseBody: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_events
       SET status = 'delivered', last_attempt_at = CURRENT_TIMESTAMP, response_status = $2, response_body = $3
       WHERE id = $1`,
      [eventId, responseStatus, responseBody],
    );
  }

  /**
   * Mark webhook event as failed
   */
  private async markWebhookEventFailed(
    eventId: string,
    responseStatus: number | null,
    errorMessage: string,
  ): Promise<void> {
    const result = await this.pool.query('SELECT attempts FROM webhook_events WHERE id = $1', [
      eventId,
    ]);

    const attempts = result.rows[0]?.attempts || 1;
    const nextRetry = WebhookEvent.calculateNextRetry(attempts);

    await this.pool.query(
      `UPDATE webhook_events
       SET status = 'failed', last_attempt_at = CURRENT_TIMESTAMP, response_status = $2, error_message = $3, next_retry_at = $4
       WHERE id = $1`,
      [eventId, responseStatus, errorMessage, nextRetry],
    );
  }

  /**
   * Get webhook events
   */
  async getWebhookEvents(
    webhookId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ events: WebhookEvent[]; total: number }> {
    let query = 'SELECT * FROM webhook_events WHERE webhook_id = $1';
    const params: any[] = [webhookId];
    let paramIndex = 2;

    if (options?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(query.replace('SELECT *', 'SELECT COUNT(*)'), params);
    const total = parseInt(countResult.rows[0].count);

    // Get events with pagination
    query += ' ORDER BY created_at DESC';
    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }
    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.pool.query(query, params);
    const events = result.rows.map((row) => new WebhookEvent(this.mapRowToWebhookEventData(row)));

    return { events, total };
  }

  /**
   * Retry webhook event
   */
  async retryWebhookEvent(eventId: string): Promise<void> {
    const eventResult = await this.pool.query('SELECT * FROM webhook_events WHERE id = $1', [
      eventId,
    ]);

    if (eventResult.rows.length === 0) {
      throw new Error('Webhook event not found');
    }

    const event = new WebhookEvent(this.mapRowToWebhookEventData(eventResult.rows[0]));

    const webhookResult = await this.pool.query('SELECT * FROM webhooks WHERE id = $1', [
      event.webhook_id,
    ]);

    if (webhookResult.rows.length === 0) {
      throw new Error('Webhook not found');
    }

    const webhook = new Webhook(this.mapRowToWebhookData(webhookResult.rows[0]));

    // Increment attempts
    await this.pool.query('UPDATE webhook_events SET attempts = attempts + 1 WHERE id = $1', [
      eventId,
    ]);

    // Attempt delivery
    await this.deliverWebhook(webhook, event.event_type, event.payload);
  }

  /**
   * Map database row to WebhookData
   */
  private mapRowToWebhookData(row: Record<string, any>): WebhookData {
    return {
      id: row.id,
      user_id: row.user_id,
      url: row.url,
      events: row.events,
      secret: row.secret,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Map database row to WebhookEventData
   */
  private mapRowToWebhookEventData(row: Record<string, any>): WebhookEventData {
    return {
      id: row.id,
      webhook_id: row.webhook_id,
      event_type: row.event_type,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      last_attempt_at: row.last_attempt_at,
      next_retry_at: row.next_retry_at,
      response_status: row.response_status,
      response_body: row.response_body,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
