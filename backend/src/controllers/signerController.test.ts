import { SignerController } from './signerController';
import { Signer } from '@/models/Signer';
import { getSettingsService } from '@/services/settingsService';

// Mock the BrandingService module - mock all dependencies used by signerController
jest.mock('@/services/brandingService', () => ({
  BrandingService: jest.fn().mockImplementation(() => ({
    getBrandingByTeamId: jest.fn().mockResolvedValue(null),
  })),
}));

// signerController now resolves the app base URL via settingsService.getAppUrl()
// (instead of a hardcoded process.env.APP_URL fallback). Mock it directly so
// the existing ordered mockPool.query queues (owner/update/audit) below don't
// need to account for an extra intermediate query, and so the resolved
// baseUrl matches the pre-existing 'http://localhost:3000' expectations.
// Note: the jest config sets resetMocks: true, which strips any
// implementation supplied inline in the factory below before every test - so
// the resolved value is (re-)established in the top-level beforeEach instead.
jest.mock('@/services/settingsService', () => ({
  getSettingsService: jest.fn(),
}));

jest.mock('@/services/loggerService', () => {
  return {
    __esModule: true,
    default: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
  };
});

describe('SignerController - resendSigningEmail', () => {
  let controller: SignerController;
  let mockPool: any;
  let mockSignerService: any;
  let mockDocumentService: any;
  let mockEmailService: any;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    mockSignerService = {
      getSignerById: jest.fn(),
      getSignersByDocumentId: jest.fn(),
    };

    mockDocumentService = {};

    mockEmailService = {
      sendSigningRequest: jest.fn(),
      generateSigningUrl: jest.fn((token: string) => `http://localhost:3000/sign/${token}`),
    };

    (getSettingsService as jest.Mock).mockReturnValue({
      getAppUrl: jest.fn().mockResolvedValue('http://localhost:3000'),
    });

    controller = new SignerController(
      mockSignerService,
      mockPool,
      mockDocumentService,
      mockEmailService
    );

    mockRequest = {
      user: {
        userId: 'user-123',
        email: 'owner@example.com',
      },
      params: {
        id: 'doc-123',
        signerId: 'signer-123',
      },
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });
  });

  describe('Document validation', () => {
    it('should return 404 if document not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not Found',
        message: 'Document not found',
      });
    });

    it('should return 400 if document status is not pending', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-123',
            title: 'Test Document',
            status: 'completed',
            workflow_type: 'parallel',
            user_id: 'user-123',
          },
        ],
      });

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad Request',
        message: 'Can only resend emails for pending documents',
      });
    });
  });

  describe('Signer validation', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-123',
            title: 'Test Document',
            status: 'pending',
            workflow_type: 'parallel',
            user_id: 'user-123',
          },
        ],
      });
    });

    it('should return 404 if signer not found', async () => {
      mockSignerService.getSignerById.mockResolvedValue(null);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not Found',
        message: 'Signer not found',
      });
    });

    it('should return 400 if signer does not belong to document', async () => {
      const mockSigner = new Signer({
        id: 'signer-123',
        document_id: 'different-doc-id',
        email: 'signer@example.com',
        name: 'John Doe',
        signing_order: null,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(mockSigner);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad Request',
        message: 'Signer does not belong to this document',
      });
    });

    it('should return 400 if signer status is not pending', async () => {
      const mockSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer@example.com',
        name: 'John Doe',
        signing_order: null,
        status: 'signed',
        access_token: 'token-123',
        signed_at: new Date(),
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(mockSigner);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad Request',
        message: "Cannot resend email to signer with status 'signed'",
      });
    });
  });

  describe('Sequential workflow validation', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-123',
            title: 'Test Document',
            status: 'pending',
            workflow_type: 'sequential',
            user_id: 'user-123',
          },
        ],
      });
    });

    it('should return 400 if not current signers turn in sequential workflow', async () => {
      const targetSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer2@example.com',
        name: 'John Doe',
        signing_order: 2,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const currentSigner = new Signer({
        id: 'signer-456',
        document_id: 'doc-123',
        email: 'signer1@example.com',
        name: 'Jane Doe',
        signing_order: 1,
        status: 'pending',
        access_token: 'token-456',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(targetSigner);
      mockSignerService.getSignersByDocumentId.mockResolvedValue([currentSigner, targetSigner]);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad Request',
        message: 'Cannot resend to this signer. It is not their turn to sign yet.',
      });
    });

    it('should allow resend for current signer in sequential workflow', async () => {
      const currentSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer1@example.com',
        name: 'Jane Doe',
        signing_order: 1,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(currentSigner);
      mockSignerService.getSignersByDocumentId.mockResolvedValue([currentSigner]);

      // Mock owner query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ email: 'owner@example.com' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              last_reminder_sent_at: new Date(),
              reminder_count: 1,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit event

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockEmailService.sendSigningRequest).toHaveBeenCalledWith({
        recipientEmail: 'signer1@example.com',
        recipientName: 'Jane Doe',
        documentTitle: 'Test Document',
        senderName: 'owner@example.com',
        signingUrl: 'http://localhost:3000/sign/token-123',
        message: undefined,
        isReminder: true,
        // Item 2.2: logging context so this send's email_logs row is
        // reachable from the per-document/per-signer endpoints.
        documentId: 'doc-123',
        signerId: 'signer-123',
        userId: 'user-123',
      });
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-123',
            title: 'Test Document',
            status: 'pending',
            workflow_type: 'parallel',
            user_id: 'user-123',
          },
        ],
      });
    });

    it('should return 429 if rate limit exceeded', async () => {
      const mockSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer@example.com',
        name: 'John Doe',
        signing_order: null,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        reminder_count: 5,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(mockSigner);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Too Many Requests',
        message:
          'Maximum resend limit reached. Please wait 24 hours before resending to this signer.',
      });
    });
  });

  describe('Successful resend', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-123',
            title: 'Test Document',
            status: 'pending',
            workflow_type: 'parallel',
            user_id: 'user-123',
          },
        ],
      });
    });

    it('should successfully resend email with all updates', async () => {
      const mockSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer@example.com',
        name: 'John Doe',
        signing_order: null,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(mockSigner);

      const mockTimestamp = new Date();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ email: 'owner@example.com' }] }) // owner query
        .mockResolvedValueOnce({
          rows: [
            {
              last_reminder_sent_at: mockTimestamp,
              reminder_count: 1,
            },
          ],
        }) // update query
        .mockResolvedValueOnce({ rows: [] }); // audit event

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockEmailService.sendSigningRequest).toHaveBeenCalledWith({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Test Document',
        senderName: 'owner@example.com',
        signingUrl: 'http://localhost:3000/sign/token-123',
        message: undefined,
        isReminder: true,
        // Item 2.2: logging context so this send's email_logs row is
        // reachable from the per-document/per-signer endpoints.
        documentId: 'doc-123',
        signerId: 'signer-123',
        userId: 'user-123',
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE signers'),
        ['signer-123']
      );

      // Item 3.1: the hand-rolled INSERT this used to assert was replaced by
      // `AuditService.recordEvent`, which writes the same row through
      // `logEvent` - hence the wider column list (ip_address/user_agent) and
      // the metadata moving to the last position.
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_events'),
        [
          'doc-123',
          'user-123',
          'signer_reminder_sent',
          null,
          null,
          expect.stringContaining('signer-123'),
        ]
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Signing invitation resent successfully',
        data: {
          signer_id: 'signer-123',
          email: 'signer@example.com',
          last_sent_at: mockTimestamp,
          reminder_count: 1,
        },
      });
    });

    it('should include custom message when provided', async () => {
      mockRequest.body = { message: 'Please review this urgently' };

      const mockSigner = new Signer({
        id: 'signer-123',
        document_id: 'doc-123',
        email: 'signer@example.com',
        name: 'John Doe',
        signing_order: null,
        status: 'pending',
        access_token: 'token-123',
        signed_at: null,
        ip_address: null,
        user_agent: null,
        last_reminder_sent_at: null,
        reminder_count: 2,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockSignerService.getSignerById.mockResolvedValue(mockSigner);

      const mockTimestamp = new Date();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ email: 'owner@example.com' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              last_reminder_sent_at: mockTimestamp,
              reminder_count: 3,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockEmailService.sendSigningRequest).toHaveBeenCalledWith({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Test Document',
        senderName: 'owner@example.com',
        signingUrl: 'http://localhost:3000/sign/token-123',
        message: 'Please review this urgently',
        isReminder: true,
        // Item 2.2: logging context so this send's email_logs row is
        // reachable from the per-document/per-signer endpoints.
        documentId: 'doc-123',
        signerId: 'signer-123',
        userId: 'user-123',
      });

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Error handling', () => {
    // G1: this catch also covers `emailService.sendSigningRequest` failures
    // - raw nodemailer text (host/port/credential-adjacent details) - and
    // this route is reachable by any team member with document access via
    // checkDocumentAccess, not just the owner. The response must carry the
    // categorized string, never the raw error.
    it('should return 500 with a categorized (non-raw) message for an unexpected error', async () => {
      mockPool.query.mockRejectedValue(new Error('Something unexpectedly exploded'));

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal Server Error',
        // No SMTP-specific keyword in the raw message, so this falls through
        // to categorizeSmtpError's fallback rather than any raw text.
        message: 'Failed to resend signing email',
      });
    });

    it('never echoes a raw nodemailer connection error (host/port) back to the caller', async () => {
      const rawError = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:587'), {
        code: 'ECONNREFUSED',
      });
      mockPool.query.mockRejectedValue(rawError);

      await controller.resendSigningEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal Server Error',
        message: 'SMTP connection failed',
      });
      const [responseBody] = mockResponse.json.mock.calls[0];
      expect(JSON.stringify(responseBody)).not.toContain('10.0.0.5');
    });
  });
});
