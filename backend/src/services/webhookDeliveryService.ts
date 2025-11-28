import { Pool } from 'pg';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookDeliveryResult {
  success: boolean;
  status_code: number | null;
  response_body: string | null;
  response_time_ms: number;
  error_message?: string;
}

export class WebhookDeliveryService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  generateHmacSignature(payload: Record<string, any>, secret: string, timestamp: number): string {
    const message = `${timestamp}.${JSON.stringify(payload)}`;
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  /**
   * Build webhook headers according to PRD spec
   */
  buildWebhookHeaders(
    event: string,
    deliveryId: string,
    timestamp: number,
    signature: string
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'EzSign-Webhooks/1.0',
      'X-EzSign-Signature': `sha256=${signature}`,
      'X-EzSign-Event': event,
      'X-EzSign-Delivery-ID': deliveryId,
      'X-EzSign-Timestamp': timestamp.toString(),
    };
  }

  /**
   * Deliver webhook to endpoint
   */
  async deliverWebhook(
    _webhookId: string,
    url: string,
    secret: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const deliveryId = uuidv4();
    const timestamp = Math.floor(Date.now() / 1000);

    try {
      // Generate HMAC signature
      const signature = this.generateHmacSignature(payload, secret, timestamp);

      // Build headers
      const headers = this.buildWebhookHeaders(eventType, deliveryId, timestamp, signature);

      // Make HTTP request
      const response = await axios.post(url, payload, {
        headers,
        timeout: 10000, // 10 second timeout
        maxRedirects: 0, // Don't follow redirects
        validateStatus: (status) => status >= 200 && status < 600, // Accept all status codes
      });

      const responseTime = Date.now() - startTime;
      const responseBody = typeof response.data === 'string'
        ? response.data.substring(0, 1000)
        : JSON.stringify(response.data).substring(0, 1000);

      return {
        success: response.status >= 200 && response.status < 300,
        status_code: response.status,
        response_body: responseBody,
        response_time_ms: responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;

      let statusCode: number | null = null;
      let errorMessage = 'Unknown error';
      let responseBody: string | null = null;

      if (axiosError.response) {
        statusCode = axiosError.response.status;
        responseBody = typeof axiosError.response.data === 'string'
          ? axiosError.response.data.substring(0, 1000)
          : JSON.stringify(axiosError.response.data).substring(0, 1000);
        errorMessage = `HTTP ${statusCode}: ${axiosError.message}`;
      } else if (axiosError.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout after 10 seconds';
      } else if (axiosError.code === 'ENOTFOUND') {
        errorMessage = 'DNS resolution failed - hostname not found';
      } else if (axiosError.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused';
      } else {
        errorMessage = axiosError.message || 'Network error';
      }

      return {
        success: false,
        status_code: statusCode,
        response_body: responseBody,
        response_time_ms: responseTime,
        error_message: errorMessage,
      };
    }
  }

  /**
   * Determine if webhook delivery should be retried based on status code
   */
  shouldRetry(statusCode: number | null): boolean {
    if (statusCode === null) {
      // Network errors (timeout, connection refused, etc.) - retry
      return true;
    }

    // Retry on these specific status codes
    if (statusCode === 408 || statusCode === 429) {
      return true;
    }

    // Retry on 5xx server errors
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Don't retry on 4xx client errors (except 408, 429)
    return false;
  }

  /**
   * Update webhook event status to delivered
   */
  async markEventDelivered(
    eventId: string,
    statusCode: number,
    responseBody: string | null,
    responseTimeMs: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_events
       SET status = 'delivered',
           response_status = $2,
           response_body = $3,
           response_time_ms = $4,
           last_attempt_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [eventId, statusCode, responseBody, responseTimeMs]
    );
  }

  /**
   * Update webhook event status to failed
   */
  async markEventFailed(
    eventId: string,
    statusCode: number | null,
    errorMessage: string,
    responseBody: string | null,
    responseTimeMs: number,
    attempts: number
  ): Promise<void> {
    // Calculate next retry time with exponential backoff
    const nextRetryAt = this.calculateNextRetry(attempts);

    await this.pool.query(
      `UPDATE webhook_events
       SET status = 'failed',
           response_status = $2,
           error_message = $3,
           response_body = $4,
           response_time_ms = $5,
           attempts = $6,
           next_retry_at = $7,
           last_attempt_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [eventId, statusCode, errorMessage, responseBody, responseTimeMs, attempts, nextRetryAt]
    );
  }

  /**
   * Calculate next retry time with exponential backoff
   * Backoff: 1 minute, 5 minutes, 30 minutes
   */
  private calculateNextRetry(attempts: number): Date | null {
    const delays = [
      60 * 1000,      // 1 minute
      5 * 60 * 1000,  // 5 minutes
      30 * 60 * 1000, // 30 minutes
    ];

    // If we've exceeded max retries, don't schedule another retry
    if (attempts >= 3) {
      return null;
    }

    const delayMs = delays[attempts] ?? delays[delays.length - 1] ?? 30 * 60 * 1000;
    return new Date(Date.now() + delayMs);
  }

  /**
   * Process webhook event delivery
   */
  async processWebhookEvent(eventId: string): Promise<void> {
    // Get event details
    const eventResult = await this.pool.query(
      `SELECT we.*, w.url, w.secret
       FROM webhook_events we
       JOIN webhooks w ON we.webhook_id = w.id
       WHERE we.id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      console.error(`Webhook event ${eventId} not found`);
      return;
    }

    const event = eventResult.rows[0];
    const currentAttempts = event.attempts || 0;

    // Increment attempt counter
    await this.pool.query(
      'UPDATE webhook_events SET attempts = attempts + 1 WHERE id = $1',
      [eventId]
    );

    // Deliver webhook
    const result = await this.deliverWebhook(
      event.webhook_id,
      event.url,
      event.secret,
      event.event_type,
      event.payload
    );

    if (result.success) {
      // Mark as delivered
      await this.markEventDelivered(
        eventId,
        result.status_code!,
        result.response_body,
        result.response_time_ms
      );
      console.log(`✓ Webhook event ${eventId} delivered successfully (${result.status_code})`);
    } else {
      // Determine if we should retry
      const shouldRetry = this.shouldRetry(result.status_code) && currentAttempts + 1 < 3;

      await this.markEventFailed(
        eventId,
        result.status_code,
        result.error_message || 'Delivery failed',
        result.response_body,
        result.response_time_ms,
        currentAttempts + 1
      );

      if (shouldRetry) {
        console.log(
          `✗ Webhook event ${eventId} failed (${result.status_code || 'network error'}), will retry (attempt ${currentAttempts + 1}/3)`
        );
      } else {
        console.log(
          `✗ Webhook event ${eventId} failed permanently (${result.status_code || 'network error'})`
        );
      }
    }
  }
}
