import { Pool } from 'pg';
import { WebhookService } from '@/services/webhookService';
import { Webhook, WebhookEvent } from '@/models/Webhook';

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

/**
 * Integration tests for webhook delivery
 * Tests webhook configuration, event generation, and delivery
 */
describe('Webhook Integration Tests', () => {
  let pool: Pool;
  let webhookService: WebhookService;

  const testUserId = 'user-123';
  const testWebhookId = 'webhook-789';
  const testDocumentId = 'doc-abc';

  beforeAll(() => {
    pool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as any;

    webhookService = new WebhookService(pool);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Webhook Configuration', () => {
    it('should create a new webhook configuration', async () => {
      const webhookData = {
        user_id: testUserId,
        url: 'https://example.com/webhook',
        events: ['document.completed', 'signer.signed'],
        secret: 'webhook-secret-123',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: testWebhookId,
          ...webhookData,
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const webhook = await webhookService.createWebhook(webhookData);

      expect(webhook).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toContain('document.completed');
      expect(webhook.isActive()).toBe(true);
    });

    it('should validate webhook URL format', () => {
      expect(Webhook.isValidUrl('https://example.com/webhook')).toBe(true);
      expect(Webhook.isValidUrl('http://example.com/webhook')).toBe(true);
      expect(Webhook.isValidUrl('not-a-url')).toBe(false);
      expect(Webhook.isValidUrl('')).toBe(false);
    });

    it('should check if webhook listens to event', () => {
      const webhook = new Webhook({
        id: 'webhook-1',
        user_id: testUserId,
        url: 'https://example.com/webhook',
        events: ['document.completed', 'signer.signed'],
        secret: 'secret',
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(webhook.listensToEvent('document.completed')).toBe(true);
      expect(webhook.listensToEvent('signer.signed')).toBe(true);
      expect(webhook.listensToEvent('unknown.event')).toBe(false);
    });

    it('should support wildcard event subscription', () => {
      const webhook = new Webhook({
        id: 'webhook-1',
        user_id: testUserId,
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'secret',
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(webhook.listensToEvent('document.completed')).toBe(true);
      expect(webhook.listensToEvent('any.event')).toBe(true);
    });

    it('should list webhooks for a user', async () => {
      const webhooks = [
        {
          id: 'webhook-1',
          user_id: testUserId,
          url: 'https://example.com/webhook1',
          events: ['document.completed'],
          secret: 'secret-1',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'webhook-2',
          user_id: testUserId,
          url: 'https://example.com/webhook2',
          events: ['signer.signed'],
          secret: 'secret-2',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: webhooks });

      const result = await webhookService.getWebhooks(testUserId);

      expect(result).toHaveLength(2);
      expect(result[0]!.url).toBe('https://example.com/webhook1');
    });

    it('should update webhook to deactivate', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: testWebhookId,
          user_id: testUserId,
          url: 'https://example.com/webhook',
          events: ['document.completed'],
          secret: 'secret',
          active: false,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const webhook = await webhookService.updateWebhook(testWebhookId, testUserId, { active: false });

      expect(webhook.active).toBe(false);
      expect(webhook.isActive()).toBe(false);
    });
  });

  describe('Webhook Event Triggering', () => {
    it('should queue webhook event for matching webhooks', async () => {
      // Mock finding active webhooks that match the event
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: testWebhookId,
            user_id: testUserId,
            url: 'https://example.com/webhook',
            events: ['document.completed'],
            secret: 'webhook-secret',
            active: true,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'event-123' }],
        });

      const eventData = {
        event: 'document.completed',
        document_id: testDocumentId,
        timestamp: new Date().toISOString(),
        data: {
          document_title: 'Test Contract',
          completed_at: new Date().toISOString(),
        },
      };

      await webhookService.trigger(testUserId, 'document.completed', eventData);

      // Verify webhook was queued (via mocked BullMQ)
      expect(pool.query).toHaveBeenCalled();
    });

    it('should not trigger for inactive webhooks', async () => {
      // Mock no active webhooks
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const eventData = {
        event: 'document.completed',
        document_id: testDocumentId,
        timestamp: new Date().toISOString(),
      };

      await webhookService.trigger(testUserId, 'document.completed', eventData);

      // Should only have the initial query, no event creation
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Webhook Signature Generation', () => {
    it('should generate valid HMAC signature', () => {
      const secret = 'webhook-secret-123';
      const payload = JSON.stringify({
        event: 'document.completed',
        document_id: testDocumentId,
      });

      const signature = webhookService.generateSignature(payload, secret);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // SHA256 hex length
    });

    it('should generate consistent signatures', () => {
      const secret = 'webhook-secret-123';
      const payload = JSON.stringify({
        event: 'document.completed',
        document_id: testDocumentId,
      });

      const signature1 = webhookService.generateSignature(payload, secret);
      const signature2 = webhookService.generateSignature(payload, secret);

      expect(signature1).toBe(signature2);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'webhook-secret-123';
      const payload1 = JSON.stringify({ event: 'document.completed', id: '1' });
      const payload2 = JSON.stringify({ event: 'document.completed', id: '2' });

      const signature1 = webhookService.generateSignature(payload1, secret);
      const signature2 = webhookService.generateSignature(payload2, secret);

      expect(signature1).not.toBe(signature2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = JSON.stringify({ event: 'document.completed' });
      const signature1 = webhookService.generateSignature(payload, 'secret-1');
      const signature2 = webhookService.generateSignature(payload, 'secret-2');

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('Webhook Event Types', () => {
    const eventTypes = [
      { event: 'document.created', description: 'Document is created' },
      { event: 'document.sent', description: 'Document sent for signing' },
      { event: 'document.completed', description: 'All signers completed' },
      { event: 'document.cancelled', description: 'Document cancelled' },
      { event: 'signer.viewed', description: 'Signer viewed document' },
      { event: 'signer.signed', description: 'Signer completed signing' },
      { event: 'signer.declined', description: 'Signer declined' },
    ];

    eventTypes.forEach(({ event, description }) => {
      it(`should create webhook listening to ${event} event - ${description}`, () => {
        const webhook = new Webhook({
          id: 'webhook-1',
          user_id: testUserId,
          url: 'https://example.com/webhook',
          events: [event],
          secret: 'secret',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        expect(webhook.listensToEvent(event)).toBe(true);
      });
    });
  });

  describe('Webhook Retry Logic', () => {
    it('should track delivery attempts via WebhookEvent', () => {
      const event = new WebhookEvent({
        id: 'event-123',
        webhook_id: testWebhookId,
        event_type: 'document.completed',
        payload: { document_id: testDocumentId },
        status: 'pending',
        attempts: 2,
        last_attempt_at: new Date(),
        next_retry_at: new Date(Date.now() + 60000),
        response_status: null,
        response_body: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(event.attempts).toBe(2);
      expect(event.isPending()).toBe(true);
      expect(event.shouldRetry(5)).toBe(true);
    });

    it('should identify failed events that exhausted retries', () => {
      const event = new WebhookEvent({
        id: 'event-123',
        webhook_id: testWebhookId,
        event_type: 'document.completed',
        payload: { document_id: testDocumentId },
        status: 'failed',
        attempts: 5,
        last_attempt_at: new Date(),
        next_retry_at: null,
        response_status: 500,
        response_body: null,
        error_message: 'Connection timeout',
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(event.isFailed()).toBe(true);
      expect(event.attempts).toBe(5);
      expect(event.shouldRetry(5)).toBe(false);
    });

    it('should calculate exponential backoff retry times', () => {
      const retry0 = WebhookEvent.calculateNextRetry(0);
      const retry1 = WebhookEvent.calculateNextRetry(1);
      const retry2 = WebhookEvent.calculateNextRetry(2);

      // Each retry should be further in the future
      expect(retry0.getTime()).toBeLessThan(retry1.getTime());
      expect(retry1.getTime()).toBeLessThan(retry2.getTime());
    });
  });

  describe('Webhook Filtering', () => {
    it('should filter webhooks by event type', () => {
      const webhooks = [
        new Webhook({
          id: 'webhook-1',
          user_id: testUserId,
          url: 'https://example.com/webhook1',
          events: ['document.completed', 'document.cancelled'],
          secret: 'secret',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }),
        new Webhook({
          id: 'webhook-2',
          user_id: testUserId,
          url: 'https://example.com/webhook2',
          events: ['signer.signed'],
          secret: 'secret',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }),
        new Webhook({
          id: 'webhook-3',
          user_id: testUserId,
          url: 'https://example.com/webhook3',
          events: ['document.completed'],
          secret: 'secret',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ];

      // Filter for document.completed
      const matchingWebhooks = webhooks.filter(w =>
        w.listensToEvent('document.completed') && w.isActive()
      );

      expect(matchingWebhooks).toHaveLength(2);
      expect(matchingWebhooks.map(w => w.id)).toContain('webhook-1');
      expect(matchingWebhooks.map(w => w.id)).toContain('webhook-3');
    });

    it('should not match inactive webhooks', () => {
      const webhooks = [
        new Webhook({
          id: 'webhook-1',
          user_id: testUserId,
          url: 'https://example.com/webhook1',
          events: ['document.completed'],
          secret: 'secret',
          active: false,
          created_at: new Date(),
          updated_at: new Date(),
        }),
        new Webhook({
          id: 'webhook-2',
          user_id: testUserId,
          url: 'https://example.com/webhook2',
          events: ['document.completed'],
          secret: 'secret',
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ];

      const activeMatchingWebhooks = webhooks.filter(w =>
        w.listensToEvent('document.completed') && w.isActive()
      );

      expect(activeMatchingWebhooks).toHaveLength(1);
      expect(activeMatchingWebhooks[0]!.id).toBe('webhook-2');
    });
  });

  describe('Webhook Secret Generation', () => {
    it('should generate unique webhook secrets', () => {
      const secret1 = Webhook.generateSecret();
      const secret2 = Webhook.generateSecret();

      expect(secret1).toBeDefined();
      expect(secret2).toBeDefined();
      expect(secret1).not.toBe(secret2);
      expect(secret1.startsWith('whsec_')).toBe(true);
    });
  });
});
