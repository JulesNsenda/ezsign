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

jest.mock('@/services/reminderService', () => ({
  createReminderService: jest.fn(),
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

jest.mock('@/utils/urlBuilder', () => ({
  buildSigningUrl: jest.fn((base: string, token: string) => `${base}/sign/${token}`),
}));

import { registerWorker, QueueName, NormalizedJob } from '@/config/queue';
import { createReminderService } from '@/services/reminderService';
import { EmailService } from '@/services/emailService';
import { BrandingService } from '@/services/brandingService';
import { getSettingsService } from '@/services/settingsService';
import { createReminderWorker } from './reminderWorker';

const mockRegisterWorker = registerWorker as jest.Mock;
const mockCreateReminderService = createReminderService as jest.Mock;
const mockWithProvider = EmailService.withProvider as jest.Mock;
const MockedBrandingService = BrandingService as unknown as jest.Mock;
const mockGetSettingsService = getSettingsService as jest.Mock;

describe('reminderWorker (pg-boss)', () => {
  let pool: { query: jest.Mock };
  let mockSendReminder: jest.Mock;
  let mockMarkReminderAsSent: jest.Mock;
  let mockGetByTeamId: jest.Mock;
  let mockGetAppUrl: jest.Mock;
  let mockGetEmailConfig: jest.Mock;

  const documentId = 'doc-1';
  const signerId = 'signer-1';
  const reminderId = 'reminder-1';

  const baseJob: NormalizedJob = {
    id: 'job-uuid-1',
    name: QueueName.DEADLINE_REMINDERS,
    data: {
      documentId,
      signerId,
      reminderType: '3_day',
      reminderId,
    },
    retryCount: 0,
    retryLimit: 2,
  };

  const docRow = {
    id: documentId,
    title: 'Doc',
    status: 'pending',
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    user_id: 'user-1',
    team_id: null,
    owner_email: 'owner@example.com',
    owner_name: 'Owner',
  };

  const signerRow = {
    id: signerId,
    email: 'signer@example.com',
    name: 'Signer One',
    access_token: 'token-1',
    status: 'pending',
  };

  beforeEach(() => {
    pool = { query: jest.fn() };

    mockSendReminder = jest.fn().mockResolvedValue(undefined);
    mockWithProvider.mockReturnValue({ sendReminder: mockSendReminder });

    mockGetByTeamId = jest.fn().mockResolvedValue(null);
    MockedBrandingService.mockImplementation(() => ({ getByTeamId: mockGetByTeamId }));

    mockGetAppUrl = jest.fn().mockResolvedValue('https://app.example.com');
    mockGetEmailConfig = jest.fn().mockResolvedValue({});
    mockGetSettingsService.mockReturnValue({
      getAppUrl: mockGetAppUrl,
      getEmailConfig: mockGetEmailConfig,
    });

    mockMarkReminderAsSent = jest.fn().mockResolvedValue(undefined);
    mockCreateReminderService.mockReturnValue({ markReminderAsSent: mockMarkReminderAsSent });
  });

  /** Registers the worker and returns the captured handler passed to registerWorker. */
  const registerAndCaptureHandler = async (): Promise<(job: NormalizedJob) => Promise<unknown>> => {
    await createReminderWorker(pool as unknown as Pool);
    return mockRegisterWorker.mock.calls[0][1];
  };

  it('registers with QueueName.DEADLINE_REMINDERS and localConcurrency:5, resolving void', async () => {
    const result = await createReminderWorker(pool as unknown as Pool);

    expect(result).toBeUndefined();
    expect(mockRegisterWorker).toHaveBeenCalledWith(
      QueueName.DEADLINE_REMINDERS,
      expect.any(Function),
      { localConcurrency: 5 }
    );
  });

  it('skips (without throwing) when the document is not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { skipped: boolean; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'document_not_found' });
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it('skips when the document is no longer pending', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...docRow, status: 'completed' }] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { skipped: boolean; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'document_not_pending' });
  });

  it('skips owner notifications (signerId null) as not yet implemented', async () => {
    pool.query.mockResolvedValueOnce({ rows: [docRow] });
    const handler = await registerAndCaptureHandler();

    const ownerJob: NormalizedJob = {
      ...baseJob,
      data: { ...baseJob.data as object, signerId: null },
    };
    const result = (await handler(ownerJob)) as { skipped: boolean; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'owner_notification_not_implemented' });
  });

  it('skips when the signer is no longer pending', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [docRow] })
      .mockResolvedValueOnce({ rows: [{ ...signerRow, status: 'signed' }] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { skipped: boolean; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'signer_not_pending' });
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it('sends the reminder email and marks the reminder as sent on the happy path', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [docRow] })
      .mockResolvedValueOnce({ rows: [signerRow] });
    const handler = await registerAndCaptureHandler();

    const result = (await handler(baseJob)) as { sent: boolean };

    expect(result.sent).toBe(true);
    expect(mockSendReminder).toHaveBeenCalledTimes(1);
    expect(mockMarkReminderAsSent).toHaveBeenCalledWith(reminderId);
  });

  it('rethrows on failure so registerWorker can retry/DLQ the job', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [docRow] })
      .mockResolvedValueOnce({ rows: [signerRow] });
    mockSendReminder.mockRejectedValueOnce(new Error('smtp down'));
    const handler = await registerAndCaptureHandler();

    await expect(handler(baseJob)).rejects.toThrow('smtp down');
    expect(mockMarkReminderAsSent).not.toHaveBeenCalled();
  });
});
