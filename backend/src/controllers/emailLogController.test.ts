import { Pool } from 'pg';
import crypto from 'crypto';
import { EmailLogController } from './emailLogController';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const WEBHOOK_SECRET = 'test-webhook-secret-do-not-use-in-production';

// G7: the signature now binds an X-Webhook-Timestamp into the HMAC input
// (`${timestamp}.${rawBody}`) rather than signing the body alone, so a
// captured (body, signature) pair can't replay indefinitely.
function signBody(
  body: unknown,
  timestamp: string = Date.now().toString(),
): { rawBody: Buffer; signature: string; timestamp: string } {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');
  return { rawBody, signature, timestamp };
}

describe('EmailLogController', () => {
  let controller: EmailLogController;
  let mockEmailLogService: {
    getByDocumentId: jest.Mock;
    getDocumentEmailStats: jest.Mock;
    queryLogs: jest.Mock;
    getById: jest.Mock;
    getByMessageId: jest.Mock;
    markAsDelivered: jest.Mock;
    markAsBounced: jest.Mock;
    markAsFailed: jest.Mock;
    markAsOpened: jest.Mock;
  };
  let mockPoolQuery: jest.Mock;
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.Mock;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    mockPoolQuery = jest.fn().mockResolvedValue({ rows: [] });
    const mockPool = { query: mockPoolQuery } as unknown as Pool;
    controller = new EmailLogController(mockPool);

    mockEmailLogService = {
      getByDocumentId: jest.fn(),
      getDocumentEmailStats: jest.fn(),
      queryLogs: jest.fn(),
      getById: jest.fn(),
      getByMessageId: jest.fn(),
      markAsDelivered: jest.fn(),
      markAsBounced: jest.fn(),
      markAsFailed: jest.fn(),
      markAsOpened: jest.fn(),
    };
    (controller as any).emailLogService = mockEmailLogService;

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });
    mockNext = jest.fn();

    mockRequest = { params: {}, query: {}, headers: {}, body: {} };
    mockResponse = { status: responseStatus, json: responseJson };

    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  describe('getDocumentEmails - pagination clamping', () => {
    beforeEach(() => {
      mockRequest.params = { id: 'doc-1' };
      mockRequest.user = { userId: 'admin-1', email: 'admin@example.com', role: 'admin' };
      mockEmailLogService.getByDocumentId.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
    });

    it('clamps an oversized pageSize to the 100 upper bound instead of pulling the whole table', async () => {
      mockRequest.query = { pageSize: '10000000' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.getByDocumentId).toHaveBeenCalledWith('doc-1', 1, 100);
    });

    it('normalizes page=0 to page 1 instead of a negative Postgres OFFSET', async () => {
      mockRequest.query = { page: '0' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.getByDocumentId).toHaveBeenCalledWith('doc-1', 1, 20);
    });

    it('normalizes a negative page to page 1', async () => {
      mockRequest.query = { page: '-5' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.getByDocumentId).toHaveBeenCalledWith('doc-1', 1, 20);
    });

    it('normalizes a non-numeric pageSize to the default of 20', async () => {
      mockRequest.query = { pageSize: 'not-a-number' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.getByDocumentId).toHaveBeenCalledWith('doc-1', 1, 20);
    });
  });

  describe('getDocumentEmails - categorized vs raw error split', () => {
    beforeEach(() => {
      mockRequest.params = { id: 'doc-1' };
      mockRequest.query = {};
      mockEmailLogService.getByDocumentId.mockResolvedValue({
        logs: [
          { id: 'log-1', status: 'failed', errorMessage: 'connect ECONNREFUSED 10.0.0.5:587' },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('gives an instance admin the raw error without querying the database', async () => {
      mockRequest.user = { userId: 'admin-1', email: 'admin@example.com', role: 'admin' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: [expect.objectContaining({ errorMessage: 'connect ECONNREFUSED 10.0.0.5:587' })],
        })
      );
    });

    // G2 (deliberate tightening): `error_message` describes the instance's
    // SMTP transport (host/port/auth username), not anything document-scoped
    // - so the document owner no longer gets raw text either, only the
    // categorized string. Previously the owner got the raw message; that was
    // itself the bug (any user could self-invite an SMTP-probing document).
    it('gives the document owner (non-admin) the categorized error, not raw SMTP details', async () => {
      mockRequest.user = { userId: 'owner-1', email: 'owner@example.com', role: 'creator' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: [expect.objectContaining({ errorMessage: 'SMTP connection failed' })],
        })
      );
    });

    it('gives a team member who is neither owner nor admin the categorized error', async () => {
      mockRequest.user = { userId: 'team-member-1', email: 'member@example.com', role: 'creator' };

      await controller.getDocumentEmails(mockRequest, mockResponse, mockNext);

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          logs: [expect.objectContaining({ errorMessage: 'SMTP connection failed' })],
        })
      );
    });
  });

  describe('getAllEmails - pagination clamping', () => {
    it('caps an oversized pageSize and normalizes a non-numeric page', async () => {
      mockRequest.query = { pageSize: '99999', page: 'abc' };
      mockEmailLogService.queryLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 100,
        totalPages: 0,
      });

      await controller.getAllEmails(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.queryLogs).toHaveBeenCalledWith({}, 1, 100);
    });
  });

  describe('handleDeliveryWebhook - HMAC gate', () => {
    it('rejects a request with no signature header', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      mockRequest.body = body;
      mockRequest.rawBody = Buffer.from(JSON.stringify(body));
      mockRequest.headers = { 'x-webhook-timestamp': Date.now().toString() };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockEmailLogService.getByMessageId).not.toHaveBeenCalled();
    });

    it('rejects a request with an invalid signature', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      mockRequest.body = body;
      mockRequest.rawBody = Buffer.from(JSON.stringify(body));
      mockRequest.headers = {
        'x-webhook-signature': 'a'.repeat(64),
        'x-webhook-timestamp': Date.now().toString(),
      };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockEmailLogService.getByMessageId).not.toHaveBeenCalled();
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const timestamp = Date.now().toString();
      const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = {
        'x-webhook-signature': crypto.createHmac('sha256', 'wrong-secret').update(signedPayload).digest('hex'),
        'x-webhook-timestamp': timestamp,
      };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it('rejects a signature missing its timestamp binding - proves a captured pre-hardening (body, signature) pair cannot replay', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      const rawBody = Buffer.from(JSON.stringify(body));
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = {
        // Signed over the body alone, exactly as the pre-G7 contract did -
        // and with no x-webhook-timestamp header at all.
        'x-webhook-signature': crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'),
      };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockEmailLogService.getByMessageId).not.toHaveBeenCalled();
    });

    it('rejects a correctly-signed request whose timestamp is more than 5 minutes stale', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      const staleTimestamp = (Date.now() - 6 * 60 * 1000).toString();
      const { rawBody, signature, timestamp } = signBody(body, staleTimestamp);
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockEmailLogService.getByMessageId).not.toHaveBeenCalled();
    });

    it('fails closed when WEBHOOK_SECRET is not configured', async () => {
      delete process.env.WEBHOOK_SECRET;
      const body = { messageId: 'msg-1', status: 'delivered' };
      const { rawBody, signature, timestamp } = signBody(body);
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp };

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(mockEmailLogService.getByMessageId).not.toHaveBeenCalled();
    });

    it('accepts a request with a valid signature and timestamp, and updates the log', async () => {
      const body = { messageId: 'msg-1', status: 'delivered' };
      const { rawBody, signature, timestamp } = signBody(body);
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp };
      mockEmailLogService.getByMessageId.mockResolvedValue({ id: 'log-1' });

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.getByMessageId).toHaveBeenCalledWith('msg-1');
      expect(mockEmailLogService.markAsDelivered).toHaveBeenCalledWith('log-1');
      expect(responseStatus).toHaveBeenCalledWith(200);
    });

    it('coerces and caps an attacker-controlled error field to 1000 characters', async () => {
      const longError = 'x'.repeat(2000);
      const body = { messageId: 'msg-1', status: 'failed', error: longError };
      const { rawBody, signature, timestamp } = signBody(body);
      mockRequest.body = body;
      mockRequest.rawBody = rawBody;
      mockRequest.headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp };
      mockEmailLogService.getByMessageId.mockResolvedValue({ id: 'log-1' });

      await controller.handleDeliveryWebhook(mockRequest, mockResponse, mockNext);

      expect(mockEmailLogService.markAsFailed).toHaveBeenCalledTimes(1);
      const [, capturedError] = mockEmailLogService.markAsFailed.mock.calls[0];
      expect(typeof capturedError).toBe('string');
      expect((capturedError as string).length).toBe(1000);
    });
  });

  describe('getSignerEmails removal', () => {
    it('no longer exposes a getSignerEmails route on the email log router (deleted alongside createDocumentEmailRouter/createSignerEmailRouter)', () => {
      // A meaningless-typo-proof check that the *route*, not just some
      // arbitrarily-named property, is gone: the controller class has no
      // method whose name contains "signerEmails" in any casing.
      const methodNames = Object.getOwnPropertyNames(controller);
      const matches = methodNames.filter((name) => /signeremails/i.test(name));
      expect(matches).toEqual([]);
    });
  });
});
