import { Pool } from 'pg';
import { DeadLetterQueueService } from './deadLetterQueueService';
import { enqueue, QueueName } from '@/config/queue';
import type { NormalizedJob } from '@/config/queue';

// pg-boss ships ESM-only, so requireActual-ing '@/config/queue' below would
// otherwise crash ts-jest trying to parse it - mock the package first (same
// fix as src/config/queue.test.ts) so requireActual only pulls in the real
// QueueName enum and friends, never pg-boss's own module.
jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));

// Mock the pg-boss queue hub - retryJob re-enqueues via `enqueue` instead of
// the old BullMQ createQueue/queue.add/queue.close.
jest.mock('@/config/queue', () => ({
  ...jest.requireActual('@/config/queue'),
  enqueue: jest.fn(),
}));

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedEnqueue = enqueue as jest.Mock;

describe('DeadLetterQueueService', () => {
  let pool: Pool;
  let service: DeadLetterQueueService;

  beforeEach(() => {
    pool = { query: jest.fn() } as unknown as Pool;
    service = new DeadLetterQueueService(pool);
    mockedEnqueue.mockResolvedValue('new-job-456');
  });

  describe('addFailedJob', () => {
    const normalizedJob: NormalizedJob = {
      id: 'job-abc',
      name: 'deliver-webhook',
      data: { eventId: 'event-123' },
      retryCount: 2,
      retryLimit: 2,
    };

    it('normalizes a NormalizedJob into the DLQ insert, mapping retryCount/retryLimit correctly', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'dlq-1' }],
      });

      const error = new Error('delivery failed');
      await service.addFailedJob(normalizedJob, error, QueueName.WEBHOOK_DELIVERY);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [query, values] = (pool.query as jest.Mock).mock.calls[0];

      expect(query).toContain('INSERT INTO dead_letter_queue');
      expect(values).toEqual([
        QueueName.WEBHOOK_DELIVERY,
        'job-abc', // jobId: job.id, no more `|| 'unknown'` fallback
        'deliver-webhook', // jobName: job.name
        JSON.stringify({ eventId: 'event-123' }), // jobData: job.data
        'delivery failed', // errorMessage
        error.stack, // errorStack
        2, // attemptsMade: job.retryCount (was job.attemptsMade)
        2, // maxAttempts: job.retryLimit (was job.opts?.attempts || 3)
        null, // metadata: NormalizedJob carries no timestamp/processedOn/opts equivalent
      ]);
    });

    it('does not throw on a job id that would have been falsy under BullMQ (pg-boss ids are always UUID strings)', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'dlq-2' }] });

      const job: NormalizedJob = { ...normalizedJob, id: '0' };
      await service.addFailedJob(job, new Error('boom'), QueueName.CLEANUP);

      const [, values] = (pool.query as jest.Mock).mock.calls[0];
      expect(values[1]).toBe('0');
    });
  });

  describe('retryJob', () => {
    const dlqEntry = {
      id: 'dlq-1',
      queue_name: QueueName.WEBHOOK_DELIVERY,
      job_id: 'job-abc',
      job_name: 'deliver-webhook',
      job_data: { eventId: 'event-123' },
      status: 'failed',
      max_attempts: 3,
    };

    it('re-enqueues via `enqueue` with retryLimit = max_attempts (already pg-boss semantics)', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [dlqEntry] }) // getById
        .mockResolvedValueOnce({ rowCount: 1 }) // updateStatus('retrying')
        .mockResolvedValueOnce({ rowCount: 1 }); // final UPDATE (resolved)

      const result = await service.retryJob('dlq-1');

      expect(mockedEnqueue).toHaveBeenCalledTimes(1);
      expect(mockedEnqueue).toHaveBeenCalledWith(
        QueueName.WEBHOOK_DELIVERY,
        dlqEntry.job_data,
        { retryLimit: 3 },
      );
      expect(result).toEqual({ success: true, newJobId: 'new-job-456' });
    });

    it('clamps retryLimit to 0 rather than going negative when max_attempts is 0', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ ...dlqEntry, max_attempts: 0 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.retryJob('dlq-1');

      expect(mockedEnqueue).toHaveBeenCalledWith(
        QueueName.WEBHOOK_DELIVERY,
        dlqEntry.job_data,
        { retryLimit: 0 },
      );
    });

    it('reverts status to failed and returns an error when enqueue throws', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [dlqEntry] }) // getById
        .mockResolvedValueOnce({ rowCount: 1 }) // updateStatus('retrying')
        .mockResolvedValueOnce({ rowCount: 1 }); // updateStatus('failed') revert

      mockedEnqueue.mockRejectedValueOnce(new Error('queue system not started'));

      const result = await service.retryJob('dlq-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('queue system not started');
    });

    it('does not call enqueue for a DLQ entry that is not in failed status', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ...dlqEntry, status: 'resolved' }],
      });

      const result = await service.retryJob('dlq-1');

      expect(result).toEqual({
        success: false,
        error: 'Cannot retry job with status: resolved',
      });
      expect(mockedEnqueue).not.toHaveBeenCalled();
    });

    it.each([QueueName.SCHEDULED_SEND, QueueName.DEADLINE_REMINDERS])(
      'blocks retrying a %s DLQ entry (would fire immediately, bypass singletonKey dedup, and orphan the persisted job id)',
      async (queueName) => {
        (pool.query as jest.Mock).mockResolvedValueOnce({
          rows: [{ ...dlqEntry, queue_name: queueName }],
        });

        const result = await service.retryJob('dlq-1');

        expect(result).toEqual({
          success: false,
          error:
            'Time-scheduled jobs cannot be retried from the dead-letter queue - reschedule from the document instead',
        });
        expect(mockedEnqueue).not.toHaveBeenCalled();
        // No status flip to 'retrying' either - only the initial getById read happened.
        expect(pool.query).toHaveBeenCalledTimes(1);
      }
    );
  });
});
