import { Pool } from 'pg';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/config/queue', () => ({
  registerWorker: jest.fn(),
  QueueName: {
    PDF_PROCESSING: 'pdf-processing',
    WEBHOOK_DELIVERY: 'webhook-delivery',
    CLEANUP: 'cleanup',
    SCHEDULED_SEND: 'scheduled-send',
    DEADLINE_REMINDERS: 'deadline-reminders',
  },
}));

jest.mock('@/services/emailService', () => ({
  EmailService: {
    withProvider: jest.fn(),
  },
}));

jest.mock('@/services/brandingService', () => ({
  BrandingService: jest.fn(),
}));

jest.mock('@/services/emailLogService', () => ({
  createEmailLogService: jest.fn(() => ({})),
}));

jest.mock('@/services/settingsService', () => ({
  getSettingsService: jest.fn(),
}));

jest.mock('@/services/socketService', () => ({
  socketService: {
    emitDocumentUpdate: jest.fn(),
  },
}));

jest.mock('@/utils/urlBuilder', () => ({
  buildSigningUrl: jest.fn((base: string, token: string) => `${base}/sign/${token}`),
}));

import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { EmailService } from '@/services/emailService';
import { BrandingService } from '@/services/brandingService';
import { getSettingsService } from '@/services/settingsService';
import { socketService } from '@/services/socketService';
import { createScheduledSendWorker } from './scheduledSendWorker';

const mockRegisterWorker = registerWorker as jest.Mock;
const mockWithProvider = EmailService.withProvider as jest.Mock;
const MockedBrandingService = BrandingService as unknown as jest.Mock;
const mockGetSettingsService = getSettingsService as jest.Mock;
const mockEmitDocumentUpdate = socketService.emitDocumentUpdate as jest.Mock;

describe('scheduledSendWorker (pg-boss)', () => {
  let pool: { query: jest.Mock };
  let mockSendSigningRequest: jest.Mock;
  let mockGetByTeamId: jest.Mock;
  let mockGetAppUrl: jest.Mock;
  let mockGetEmailConfig: jest.Mock;

  const documentId = 'doc-1';
  const userId = 'user-1';

  const baseJob: NormalizedJob = {
    id: 'job-uuid-1',
    name: QueueName.SCHEDULED_SEND,
    data: {
      documentId,
      scheduledAt: new Date().toISOString(),
      timezone: 'UTC',
      userId,
    },
    retryCount: 0,
    retryLimit: 2,
  };

  const signerRow = {
    id: 'signer-1',
    document_id: documentId,
    email: 'signer@example.com',
    name: 'Signer One',
    signing_order: 0,
    status: 'pending',
    access_token: 'token-1',
    signed_at: null,
    ip_address: null,
    user_agent: null,
    last_reminder_sent_at: null,
    reminder_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    pool = { query: jest.fn() };

    mockSendSigningRequest = jest.fn().mockResolvedValue(undefined);
    mockWithProvider.mockReturnValue({ sendSigningRequest: mockSendSigningRequest });

    mockGetByTeamId = jest.fn().mockResolvedValue(null);
    MockedBrandingService.mockImplementation(() => ({ getByTeamId: mockGetByTeamId }));

    mockGetAppUrl = jest.fn().mockResolvedValue('https://app.example.com');
    mockGetEmailConfig = jest.fn().mockResolvedValue({});
    mockGetSettingsService.mockReturnValue({
      getAppUrl: mockGetAppUrl,
      getEmailConfig: mockGetEmailConfig,
    });
  });

  /** Registers the worker and returns the captured handler passed to registerWorker. */
  const registerAndCaptureHandler = async (): Promise<(job: NormalizedJob) => Promise<unknown>> => {
    await createScheduledSendWorker(pool as unknown as Pool);
    return mockRegisterWorker.mock.calls[0][1];
  };

  it('registers with QueueName.SCHEDULED_SEND and localConcurrency:5, resolving void', async () => {
    const result = await createScheduledSendWorker(pool as unknown as Pool);

    expect(result).toBeUndefined();
    expect(mockRegisterWorker).toHaveBeenCalledWith(
      QueueName.SCHEDULED_SEND,
      expect.any(Function),
      { localConcurrency: 5 }
    );
  });

  it('returns success:false without throwing when the document is not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { success: boolean };

    expect(result.success).toBe(false);
  });

  it('returns success:false when the document is no longer scheduled', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'cancelled' }] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { success: boolean };

    expect(result.success).toBe(false);
  });

  it('throws when there are no signers for a still-scheduled document', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ status: 'scheduled', workflow_type: 'parallel' }] })
      .mockResolvedValueOnce({ rows: [] }); // no signers
    const handler = await registerAndCaptureHandler();

    await expect(handler(baseJob)).rejects.toThrow('No signers found for document');
  });

  it('sends to all signers for a parallel workflow and emits the socket update', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ status: 'scheduled', workflow_type: 'parallel', team_id: null, title: 'Doc' }],
      })
      .mockResolvedValueOnce({ rows: [signerRow] }) // signers
      .mockResolvedValueOnce({ rows: [] }) // UPDATE documents -> pending
      .mockResolvedValueOnce({ rows: [{ email: 'owner@example.com' }] }) // sender lookup
      .mockResolvedValueOnce({ rows: [] }); // UPDATE signers status (sendSigningEmail)

    const handler = await registerAndCaptureHandler();
    const result = (await handler(baseJob)) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mockSendSigningRequest).toHaveBeenCalledTimes(1);
    // Item 2.2: logging context so this send's email_logs row is reachable
    // from the per-document/per-signer endpoints.
    expect(mockSendSigningRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId,
        signerId: signerRow.id,
        userId,
      })
    );
    expect(mockEmitDocumentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ documentId, status: 'pending' })
    );

    // Document flipped to pending and scheduling columns cleared
    const updateCall = pool.query.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes("status = 'pending'")
    );
    expect(updateCall).toBeDefined();
  });
});
