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
  enqueue: jest.fn(),
  cancelJob: jest.fn(),
  QueueName: {
    PDF_PROCESSING: 'pdf-processing',
    WEBHOOK_DELIVERY: 'webhook-delivery',
    CLEANUP: 'cleanup',
    SCHEDULED_SEND: 'scheduled-send',
    DEADLINE_REMINDERS: 'deadline-reminders',
  },
}));

import { enqueue, cancelJob, QueueName } from '@/config/queue';
import { ScheduledSendService, createScheduledSendService } from './scheduledSendService';

const mockEnqueue = enqueue as jest.Mock;
const mockCancelJob = cancelJob as jest.Mock;

describe('ScheduledSendService (pg-boss)', () => {
  let pool: { query: jest.Mock };
  let service: ScheduledSendService;

  const documentId = 'doc-1';
  const userId = 'user-1';
  const timezone = 'UTC';
  const sendAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  beforeEach(() => {
    pool = { query: jest.fn() };
    service = createScheduledSendService(pool as unknown as Pool);

    mockCancelJob.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue('job-uuid-new');
  });

  describe('scheduleDocumentSend', () => {
    it('rejects a sendAt that is not in the future', async () => {
      const past = new Date(Date.now() - 1000);

      await expect(
        service.scheduleDocumentSend(documentId, userId, past, timezone)
      ).rejects.toThrow('Scheduled time must be in the future');

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('enqueues with startAfter/singletonKey/retryLimit/retryDelay and persists the returned UUID', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: null }] }) // read existing
        .mockResolvedValueOnce({ rows: [] }); // UPDATE documents

      const result = await service.scheduleDocumentSend(documentId, userId, sendAt, timezone);

      expect(mockCancelJob).not.toHaveBeenCalled(); // no stale job to cancel
      expect(mockEnqueue).toHaveBeenCalledWith(
        QueueName.SCHEDULED_SEND,
        {
          documentId,
          scheduledAt: sendAt.toISOString(),
          timezone,
          userId,
        },
        {
          startAfter: sendAt,
          singletonKey: `scheduled-send-${documentId}`,
          retryLimit: 2,
          retryDelay: 60,
        }
      );
      // startAfter must be an actual Date instance, not a string/timestamp
      const optionsArg = mockEnqueue.mock.calls[0][2];
      expect(optionsArg.startAfter).toBeInstanceOf(Date);

      expect(result).toEqual({ jobId: 'job-uuid-new' });

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[0]).toMatch(/UPDATE documents/);
      expect(updateCall[1]).toEqual([sendAt, timezone, 'job-uuid-new', documentId]);
    });

    it('reschedule: cancels the persisted job before enqueueing a fresh one and persists the new UUID', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: 'job-uuid-old' }] }) // read existing
        .mockResolvedValueOnce({ rows: [] }); // UPDATE documents

      const result = await service.scheduleDocumentSend(documentId, userId, sendAt, timezone);

      expect(mockCancelJob).toHaveBeenCalledWith(QueueName.SCHEDULED_SEND, 'job-uuid-old');
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ jobId: 'job-uuid-new' });

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[1]).toEqual([sendAt, timezone, 'job-uuid-new', documentId]);
    });

    it('reschedule: tolerates cancelJob rejecting for the stale job (missing/already terminal)', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: 'job-uuid-old' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockCancelJob.mockRejectedValueOnce(new Error('job not found'));

      const result = await service.scheduleDocumentSend(documentId, userId, sendAt, timezone);

      expect(result).toEqual({ jobId: 'job-uuid-new' });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });

    it('singleton-conflict path: retries once after cancelling the stale job when enqueue returns null', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: 'job-uuid-old' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockEnqueue.mockResolvedValueOnce(null).mockResolvedValueOnce('job-uuid-retry');

      const result = await service.scheduleDocumentSend(documentId, userId, sendAt, timezone);

      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      // cancelJob called once up front (reschedule) + once more on the conflict retry
      expect(mockCancelJob).toHaveBeenCalledTimes(2);
      expect(mockCancelJob).toHaveBeenNthCalledWith(1, QueueName.SCHEDULED_SEND, 'job-uuid-old');
      expect(mockCancelJob).toHaveBeenNthCalledWith(2, QueueName.SCHEDULED_SEND, 'job-uuid-old');
      expect(result).toEqual({ jobId: 'job-uuid-retry' });

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[1]).toEqual([sendAt, timezone, 'job-uuid-retry', documentId]);
    });

    it('singleton-conflict path: throws a clear error when the retry also returns null', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ schedule_job_id: null }] });
      mockEnqueue.mockResolvedValue(null);

      await expect(
        service.scheduleDocumentSend(documentId, userId, sendAt, timezone)
      ).rejects.toThrow(/singletonKey/);

      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      // No stale job id was on file, so no UPDATE should have been attempted
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelScheduledSend', () => {
    it('cancels the persisted job and clears scheduling columns', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: 'job-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.cancelScheduledSend(documentId);

      expect(mockCancelJob).toHaveBeenCalledWith(QueueName.SCHEDULED_SEND, 'job-uuid-1');

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[0]).toMatch(/status = 'draft'/);
      expect(updateCall[1]).toEqual([documentId]);
    });

    it('is a no-op on the queue side when there is no persisted job id', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: null }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.cancelScheduledSend(documentId);

      expect(mockCancelJob).not.toHaveBeenCalled();
    });

    it('tolerates cancelJob rejecting (job missing/already completed) and still clears the document', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ schedule_job_id: 'job-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockCancelJob.mockRejectedValueOnce(new Error('job not found'));

      await expect(service.cancelScheduledSend(documentId)).resolves.toBeUndefined();

      const updateCall = pool.query.mock.calls[1];
      expect(updateCall[0]).toMatch(/status = 'draft'/);
    });
  });
});
