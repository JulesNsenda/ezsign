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
import { createReminderService, DocumentReminder } from './reminderService';

const mockEnqueue = enqueue as jest.Mock;
const mockCancelJob = cancelJob as jest.Mock;

describe('reminderService (pg-boss)', () => {
  let pool: { query: jest.Mock };
  let service: ReturnType<typeof createReminderService>;

  const documentId = 'doc-1';
  const signerId = 'signer-1';
  const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const reminderRow = {
    id: 'reminder-1',
    document_id: documentId,
    signer_id: signerId,
    reminder_type: '3_day',
    scheduled_for: scheduledFor,
    sent_at: null,
    job_id: null,
    created_at: new Date(),
  };

  beforeEach(() => {
    pool = { query: jest.fn() };
    service = createReminderService(pool as unknown as Pool);

    mockEnqueue.mockResolvedValue('job-uuid-1');
    mockCancelJob.mockResolvedValue(undefined);
  });

  describe('scheduleReminder', () => {
    it('returns null without enqueueing when a reminder already exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-reminder' }] });

      const result = await service.scheduleReminder(documentId, signerId, '3_day', scheduledFor);

      expect(result).toBeNull();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('enqueues with startAfter (no singletonKey) and persists the returned UUID as job_id', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // existing check - none
        .mockResolvedValueOnce({ rows: [reminderRow] }) // INSERT ... RETURNING
        .mockResolvedValueOnce({ rows: [] }); // UPDATE job_id

      const result = await service.scheduleReminder(documentId, signerId, '3_day', scheduledFor);

      expect(mockEnqueue).toHaveBeenCalledWith(
        QueueName.DEADLINE_REMINDERS,
        {
          documentId,
          signerId,
          reminderType: '3_day',
          reminderId: 'reminder-1',
        },
        { startAfter: scheduledFor }
      );
      const optionsArg = mockEnqueue.mock.calls[0][2];
      expect(optionsArg.startAfter).toBeInstanceOf(Date);
      // No singletonKey - reminder.id is already unique per row (unique DB index)
      expect(optionsArg.singletonKey).toBeUndefined();

      expect(result).not.toBeNull();
      expect((result as DocumentReminder).jobId).toBe('job-uuid-1');

      const updateCall = pool.query.mock.calls[2];
      expect(updateCall[0]).toMatch(/UPDATE document_reminders SET job_id/);
      expect(updateCall[1]).toEqual(['job-uuid-1', 'reminder-1']);
    });

    it('deletes the just-inserted row and throws when enqueue unexpectedly returns null', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [reminderRow] })
        .mockResolvedValueOnce({ rows: [] }); // DELETE
      mockEnqueue.mockResolvedValueOnce(null);

      await expect(
        service.scheduleReminder(documentId, signerId, '3_day', scheduledFor)
      ).rejects.toThrow(/Failed to enqueue reminder/);

      const deleteCall = pool.query.mock.calls[2];
      expect(deleteCall[0]).toMatch(/DELETE FROM document_reminders WHERE id = \$1/);
      expect(deleteCall[1]).toEqual(['reminder-1']);
    });
  });

  describe('cancelRemindersForDocument', () => {
    it('cancels the pg-boss job for each row and deletes the reminder records', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'reminder-1', job_id: 'job-uuid-1' },
            { id: 'reminder-2', job_id: 'job-uuid-2' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // DELETE reminder-1
        .mockResolvedValueOnce({ rows: [] }); // DELETE reminder-2

      const count = await service.cancelRemindersForDocument(documentId);

      expect(count).toBe(2);
      expect(mockCancelJob).toHaveBeenCalledWith(QueueName.DEADLINE_REMINDERS, 'job-uuid-1');
      expect(mockCancelJob).toHaveBeenCalledWith(QueueName.DEADLINE_REMINDERS, 'job-uuid-2');
    });

    it('skips cancelJob for rows with no job_id but still deletes them', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', job_id: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const count = await service.cancelRemindersForDocument(documentId);

      expect(count).toBe(1);
      expect(mockCancelJob).not.toHaveBeenCalled();
    });

    it('is tolerant of cancelJob rejecting (missing/already-completed job) and still deletes the row', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', job_id: 'job-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // DELETE
      mockCancelJob.mockRejectedValueOnce(new Error('job not found'));

      const count = await service.cancelRemindersForDocument(documentId);

      expect(count).toBe(1);
      // The DELETE still ran despite cancelJob rejecting
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelRemindersForSigner', () => {
    it('cancels the pg-boss job and deletes the reminder record', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', job_id: 'job-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const count = await service.cancelRemindersForSigner(signerId);

      expect(count).toBe(1);
      expect(mockCancelJob).toHaveBeenCalledWith(QueueName.DEADLINE_REMINDERS, 'job-uuid-1');
    });

    it('is tolerant of cancelJob rejecting and still deletes the row', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'reminder-1', job_id: 'job-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockCancelJob.mockRejectedValueOnce(new Error('job not found'));

      const count = await service.cancelRemindersForSigner(signerId);

      expect(count).toBe(1);
    });
  });
});
