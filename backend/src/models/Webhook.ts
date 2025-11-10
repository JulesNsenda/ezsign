export interface WebhookData {
  id: string;
  user_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWebhookData {
  user_id: string;
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
}

export interface UpdateWebhookData {
  url?: string;
  events?: string[];
  active?: boolean;
}

export type WebhookEventStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookEventData {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, any>;
  status: WebhookEventStatus;
  attempts: number;
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export class Webhook {
  id: string;
  user_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;

  constructor(data: WebhookData) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.url = data.url;
    this.events = data.events;
    this.secret = data.secret;
    this.active = data.active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Check if webhook is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Check if webhook listens to specific event
   */
  listensToEvent(eventType: string): boolean {
    return this.events.includes(eventType) || this.events.includes('*');
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Generate webhook secret
   */
  static generateSecret(): string {
    return (
      'whsec_' +
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')
    );
  }

  /**
   * Convert to JSON
   */
  toJSON(): WebhookData {
    return {
      id: this.id,
      user_id: this.user_id,
      url: this.url,
      events: this.events,
      secret: this.secret,
      active: this.active,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Convert to public JSON (hide secret)
   */
  toPublicJSON(): Omit<WebhookData, 'secret'> & { secret_preview: string } {
    return {
      id: this.id,
      user_id: this.user_id,
      url: this.url,
      events: this.events,
      active: this.active,
      created_at: this.created_at,
      updated_at: this.updated_at,
      secret_preview: this.secret.substring(0, 12) + '...',
    };
  }
}

export class WebhookEvent {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, any>;
  status: WebhookEventStatus;
  attempts: number;
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;

  constructor(data: WebhookEventData) {
    this.id = data.id;
    this.webhook_id = data.webhook_id;
    this.event_type = data.event_type;
    this.payload = data.payload;
    this.status = data.status;
    this.attempts = data.attempts;
    this.last_attempt_at = data.last_attempt_at;
    this.next_retry_at = data.next_retry_at;
    this.response_status = data.response_status;
    this.response_body = data.response_body;
    this.error_message = data.error_message;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Check if event is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if event was delivered
   */
  isDelivered(): boolean {
    return this.status === 'delivered';
  }

  /**
   * Check if event failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Check if event should be retried
   */
  shouldRetry(maxAttempts: number = 5): boolean {
    return this.status === 'pending' && this.attempts < maxAttempts;
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  static calculateNextRetry(attempts: number): Date {
    // Exponential backoff: 1min, 5min, 15min, 1hr, 6hr
    const delays = [60, 300, 900, 3600, 21600]; // in seconds
    const delaySeconds = delays[Math.min(attempts, delays.length - 1)];
    return new Date(Date.now() + delaySeconds * 1000);
  }

  /**
   * Convert to JSON
   */
  toJSON(): WebhookEventData {
    return {
      id: this.id,
      webhook_id: this.webhook_id,
      event_type: this.event_type,
      payload: this.payload,
      status: this.status,
      attempts: this.attempts,
      last_attempt_at: this.last_attempt_at,
      next_retry_at: this.next_retry_at,
      response_status: this.response_status,
      response_body: this.response_body,
      error_message: this.error_message,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
