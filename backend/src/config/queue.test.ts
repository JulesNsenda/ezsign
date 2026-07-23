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

import logger from '@/services/loggerService';

jest.mock('@/services/deadLetterQueueService', () => ({
  DeadLetterQueueService: jest.fn(),
}));

jest.mock('pg-boss', () => ({
  PgBoss: jest.fn(),
}));

import { PgBoss } from 'pg-boss';
import { DeadLetterQueueService } from '@/services/deadLetterQueueService';
import {
  startQueues,
  stopQueues,
  getBoss,
  enqueue,
  cancelJob,
  findJob,
  getQueueStats,
  registerWorker,
  moveToDeadLetterQueue,
  QueueName,
  DEAD_LETTER_QUEUE,
  JOB_TIMEOUTS,
  NormalizedJob,
} from './queue';

/**
 * Minimal shape of the pg-boss instance methods queue.ts actually calls.
 * `jest.config.js` has `resetMocks: true`, which wipes mock implementations
 * (including ones set at `jest.fn(impl)` construction time) before every
 * test, so this instance is rebuilt from scratch in `beforeEach` and
 * re-wired as the `PgBoss` mock's return value each time - relying on a
 * fixed instance defined once in the `jest.mock` factory would silently
 * stop working after the first test.
 */
interface MockBossInstance {
  start: jest.Mock;
  stop: jest.Mock;
  createQueue: jest.Mock;
  updateQueue: jest.Mock;
  schedule: jest.Mock;
  send: jest.Mock;
  cancel: jest.Mock;
  findJobs: jest.Mock;
  getQueueStats: jest.Mock;
  work: jest.Mock;
  on: jest.Mock;
}

const MockedPgBoss = PgBoss as unknown as jest.Mock;
const MockedDeadLetterQueueService = DeadLetterQueueService as unknown as jest.Mock;

describe('config/queue (pg-boss)', () => {
  let pool: Pool;
  let mockBoss: MockBossInstance;
  let mockAddFailedJob: jest.Mock;

  beforeEach(() => {
    pool = { query: jest.fn() } as unknown as Pool;

    mockBoss = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      createQueue: jest.fn().mockResolvedValue(undefined),
      updateQueue: jest.fn().mockResolvedValue(undefined),
      schedule: jest.fn().mockResolvedValue(undefined),
      send: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      findJobs: jest.fn(),
      getQueueStats: jest.fn(),
      work: jest.fn(),
      on: jest.fn(),
    };
    MockedPgBoss.mockImplementation(() => mockBoss);

    mockAddFailedJob = jest.fn().mockResolvedValue(undefined);
    MockedDeadLetterQueueService.mockImplementation(() => ({
      addFailedJob: mockAddFailedJob,
    }));
  });

  afterEach(async () => {
    // Belt-and-suspenders: make sure the module-level singleton never leaks
    // into the next test regardless of how the current test left it.
    await stopQueues();
  });

  describe('laziness', () => {
    it('does not construct PgBoss at module import time - only inside startQueues', () => {
      expect(MockedPgBoss).not.toHaveBeenCalled();
    });
  });

  describe('startQueues', () => {
    it('starts pg-boss, creates the dead-letter queue, and creates all 5 live queues', async () => {
      await startQueues(pool);

      expect(MockedPgBoss).toHaveBeenCalledTimes(1);
      expect(mockBoss.start).toHaveBeenCalledTimes(1);
      // 5 live queues + 1 dead-letter queue.
      expect(mockBoss.createQueue).toHaveBeenCalledTimes(6);

      const createdQueueNames = mockBoss.createQueue.mock.calls.map((call) => call[0]).sort();
      expect(createdQueueNames).toEqual(
        [...Object.values(QueueName), DEAD_LETTER_QUEUE].sort()
      );
    });

    it('creates the dead-letter queue BEFORE any live queue (createQueue with deadLetter: requires the target queue to already exist)', async () => {
      await startQueues(pool);

      expect(mockBoss.createQueue.mock.calls[0]?.[0]).toBe(DEAD_LETTER_QUEUE);
    });

    it('creates the dead-letter queue with its own retry/expire policy and no deadLetter of its own', async () => {
      await startQueues(pool);

      const dlqCall = mockBoss.createQueue.mock.calls.find((call) => call[0] === DEAD_LETTER_QUEUE);
      expect(dlqCall?.[1]).toEqual({
        retryLimit: 2,
        retryDelay: 5,
        retryBackoff: true,
        expireInSeconds: 60,
        deleteAfterSeconds: 604800,
      });
    });

    it('wires every live queue to the dead-letter queue via deadLetter:', async () => {
      await startQueues(pool);

      for (const queueName of Object.values(QueueName)) {
        const call = mockBoss.createQueue.mock.calls.find((c) => c[0] === queueName);
        expect(call?.[1]?.deadLetter).toBe(DEAD_LETTER_QUEUE);
      }
    });

    it('registers a drain worker on the dead-letter queue with includeMetadata:true', async () => {
      await startQueues(pool);

      expect(mockBoss.work).toHaveBeenCalledWith(
        DEAD_LETTER_QUEUE,
        expect.objectContaining({ includeMetadata: true }),
        expect.any(Function)
      );
    });

    it('wires the db adapter to the shared pool via executeSql', async () => {
      await startQueues(pool);

      const options = MockedPgBoss.mock.calls[0][0];
      expect(options.db).toBeDefined();
      expect(typeof options.db.executeSql).toBe('function');

      (pool.query as jest.Mock).mockResolvedValue({ rows: [{ ok: 1 }] });
      const result = await options.db.executeSql('SELECT 1', [1, 2]);

      expect(pool.query).toHaveBeenCalledWith('SELECT 1', [1, 2]);
      expect(result).toEqual({ rows: [{ ok: 1 }] });
    });

    it('registers 2 cleanup schedules with distinct keys and the exact cleanupWorker payload shapes', async () => {
      await startQueues(pool);

      expect(mockBoss.schedule).toHaveBeenCalledTimes(2);

      const calls = mockBoss.schedule.mock.calls;
      const keys = calls.map((call) => call[3]?.key);
      expect(new Set(keys).size).toBe(2);
      expect(keys.sort()).toEqual(['daily-full-cleanup', 'temp-cleanup-6h'].sort());

      for (const call of calls) {
        expect(call[0]).toBe(QueueName.CLEANUP);
      }

      const dailyCall = calls.find((call) => call[3]?.key === 'daily-full-cleanup');
      expect(dailyCall[1]).toBe('0 3 * * *');
      expect(dailyCall[2]).toEqual({ type: 'full_cleanup', maxAgeHours: 24 });

      const tempCall = calls.find((call) => call[3]?.key === 'temp-cleanup-6h');
      expect(tempCall[1]).toBe('0 */6 * * *');
      expect(tempCall[2]).toEqual({ type: 'temp_files', maxAgeHours: 6 });
    });

    it('applies retryLimit/retryDelay/retryBackoff/expireInSeconds/deleteAfterSeconds per queue, with cleanup overriding retryDelay', async () => {
      await startQueues(pool);

      const callFor = (name: QueueName) =>
        mockBoss.createQueue.mock.calls.find((call) => call[0] === name)?.[1];

      expect(callFor(QueueName.CLEANUP)).toEqual({
        retryLimit: 2,
        retryDelay: 60,
        retryBackoff: true,
        expireInSeconds: JOB_TIMEOUTS[QueueName.CLEANUP],
        deleteAfterSeconds: 604800,
        deadLetter: DEAD_LETTER_QUEUE,
      });

      expect(callFor(QueueName.WEBHOOK_DELIVERY)).toEqual({
        retryLimit: 2,
        retryDelay: 1,
        retryBackoff: true,
        expireInSeconds: JOB_TIMEOUTS[QueueName.WEBHOOK_DELIVERY],
        deleteAfterSeconds: 604800,
        deadLetter: DEAD_LETTER_QUEUE,
      });

      expect(callFor(QueueName.PDF_PROCESSING)?.expireInSeconds).toBe(300);
      expect(callFor(QueueName.SCHEDULED_SEND)?.expireInSeconds).toBe(60);
      expect(callFor(QueueName.DEADLINE_REMINDERS)?.expireInSeconds).toBe(60);
    });

    it('calls updateQueue with identical options after every createQueue (createQueue is INSERT ON CONFLICT DO NOTHING - without the update, changed options like deadLetter never apply to pre-existing queues)', async () => {
      await startQueues(pool);

      // one update per queue: dead-letter infrastructure queue + 5 live queues
      expect(mockBoss.updateQueue).toHaveBeenCalledTimes(6);

      for (const call of mockBoss.createQueue.mock.calls) {
        const [name, options] = call;
        expect(mockBoss.updateQueue).toHaveBeenCalledWith(name, options);
      }
    });

    it('is a no-op if the queue system is already started', async () => {
      await startQueues(pool);
      await startQueues(pool);

      expect(MockedPgBoss).toHaveBeenCalledTimes(1);
      expect(mockBoss.start).toHaveBeenCalledTimes(1);
    });

    it('wires boss error/warning events to the logger', async () => {
      await startQueues(pool);

      const errorHandler = mockBoss.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const warningHandler = mockBoss.on.mock.calls.find((call) => call[0] === 'warning')?.[1];
      expect(errorHandler).toBeInstanceOf(Function);
      expect(warningHandler).toBeInstanceOf(Function);

      errorHandler(new Error('pg-boss blew up'));
      expect(logger.error).toHaveBeenCalledWith('pg-boss error', { error: 'pg-boss blew up' });

      warningHandler({ message: 'slow query', data: { seconds: 5 } });
      expect(logger.warn).toHaveBeenCalledWith('pg-boss warning', {
        message: 'slow query',
        data: { seconds: 5 },
      });
    });
  });

  describe('getBoss', () => {
    it('throws when the queue system has not been started', () => {
      expect(() => getBoss()).toThrow(/not started/);
    });

    it('returns the running singleton after startQueues', async () => {
      await startQueues(pool);
      expect(getBoss()).toBe(mockBoss);
    });
  });

  describe('enqueue', () => {
    beforeEach(async () => {
      await startQueues(pool);
    });

    it('passes startAfter/singletonKey/priority/retryLimit/retryDelay through to boss.send and returns the id', async () => {
      mockBoss.send.mockResolvedValue('job-uuid-1');
      const startAfter = new Date('2026-08-01T00:00:00Z');

      const id = await enqueue(
        QueueName.SCHEDULED_SEND,
        { documentId: 'doc-1' },
        {
          startAfter,
          singletonKey: 'scheduled-send-doc-1',
          priority: 5,
          retryLimit: 4,
          retryDelay: 10,
        }
      );

      expect(id).toBe('job-uuid-1');
      expect(mockBoss.send).toHaveBeenCalledWith(
        QueueName.SCHEDULED_SEND,
        { documentId: 'doc-1' },
        {
          startAfter,
          singletonKey: 'scheduled-send-doc-1',
          priority: 5,
          retryLimit: 4,
          retryDelay: 10,
        }
      );
    });

    it('returns null when boss.send suppresses the job (singletonKey dedupe)', async () => {
      mockBoss.send.mockResolvedValue(null);

      const id = await enqueue(QueueName.SCHEDULED_SEND, {}, { singletonKey: 'dupe' });

      expect(id).toBeNull();
    });
  });

  describe('cancelJob', () => {
    it('calls boss.cancel with the queue name and job id', async () => {
      await startQueues(pool);

      await cancelJob(QueueName.DEADLINE_REMINDERS, 'job-uuid-2');

      expect(mockBoss.cancel).toHaveBeenCalledWith(QueueName.DEADLINE_REMINDERS, 'job-uuid-2');
    });
  });

  describe('findJob', () => {
    beforeEach(async () => {
      await startQueues(pool);
    });

    it('returns the first matching job from findJobs', async () => {
      const job = { id: 'job-uuid-3', state: 'completed' };
      mockBoss.findJobs.mockResolvedValue([job]);

      const result = await findJob(QueueName.PDF_PROCESSING, 'job-uuid-3');

      expect(mockBoss.findJobs).toHaveBeenCalledWith(QueueName.PDF_PROCESSING, {
        id: 'job-uuid-3',
      });
      expect(result).toBe(job);
    });

    it('returns null when no job matches', async () => {
      mockBoss.findJobs.mockResolvedValue([]);

      const result = await findJob(QueueName.PDF_PROCESSING, 'missing');

      expect(result).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    it('passes through to boss.getQueueStats with { force: true } for a fresh reading', async () => {
      await startQueues(pool);
      const stats = [{ name: QueueName.WEBHOOK_DELIVERY, queuedCount: 3 }];
      mockBoss.getQueueStats.mockResolvedValue(stats);

      const result = await getQueueStats(QueueName.WEBHOOK_DELIVERY);

      expect(mockBoss.getQueueStats).toHaveBeenCalledWith(QueueName.WEBHOOK_DELIVERY, {
        force: true,
      });
      expect(result).toBe(stats);
    });
  });

  describe('registerWorker', () => {
    beforeEach(async () => {
      await startQueues(pool);
    });

    /** Pulls out the batch handler passed to boss.work in the most recent registerWorker call. */
    const getWorkHandler = (): ((jobs: unknown[]) => Promise<void>) => {
      const call = mockBoss.work.mock.calls[mockBoss.work.mock.calls.length - 1];
      return call[2];
    };

    it('registers with includeMetadata:true and passes localConcurrency through, returning the workId', async () => {
      mockBoss.work.mockResolvedValue('worker-id-1');

      const workerId = await registerWorker(QueueName.WEBHOOK_DELIVERY, jest.fn(), {
        localConcurrency: 3,
      });

      expect(workerId).toBe('worker-id-1');
      expect(mockBoss.work).toHaveBeenCalledWith(
        QueueName.WEBHOOK_DELIVERY,
        expect.objectContaining({ includeMetadata: true, localConcurrency: 3 }),
        expect.any(Function)
      );
    });

    it('normalizes each job in the batch to { id, name, data, retryCount, retryLimit, signal } before invoking the handler', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      await registerWorker(QueueName.WEBHOOK_DELIVERY, handler);
      const workHandler = getWorkHandler();

      const fakeSignal = {} as AbortSignal;
      const rawJob = {
        id: 'job-1',
        name: QueueName.WEBHOOK_DELIVERY,
        data: { webhookId: 'wh-1' },
        retryCount: 0,
        retryLimit: 2,
        signal: fakeSignal,
        // extra pg-boss metadata fields that must NOT leak into the normalized shape
        state: 'active',
        priority: 0,
        createdOn: new Date(),
      };

      await workHandler([rawJob]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        id: 'job-1',
        name: QueueName.WEBHOOK_DELIVERY,
        data: { webhookId: 'wh-1' },
        retryCount: 0,
        retryLimit: 2,
        signal: fakeSignal,
      });
    });

    it('processes a batch sequentially, one handler call per job', async () => {
      const order: string[] = [];
      const handler = jest.fn().mockImplementation(async (job: NormalizedJob) => {
        order.push(job.id);
      });
      await registerWorker(QueueName.WEBHOOK_DELIVERY, handler);
      const workHandler = getWorkHandler();

      await workHandler([
        { id: 'a', name: 'x', data: {}, retryCount: 0, retryLimit: 2 },
        { id: 'b', name: 'x', data: {}, retryCount: 0, retryLimit: 2 },
      ]);

      expect(order).toEqual(['a', 'b']);
    });

    it('returns the handler resolved value from the batch callback so pg-boss stores it as the job output', async () => {
      const handler = jest.fn().mockResolvedValue({ delivered: true });
      await registerWorker(QueueName.WEBHOOK_DELIVERY, handler);
      const workHandler = getWorkHandler();

      const returned = await workHandler([
        { id: 'job-out', name: 'x', data: {}, retryCount: 0, retryLimit: 2 },
      ]);

      expect(returned).toEqual({ delivered: true });
    });

    it('on handler throw: rethrows regardless of retryCount, WITHOUT calling the DLQ helper (dead-lettering is now pg-boss\'s native deadLetter-queue path, not an in-handler check)', async () => {
      const failure = new Error('final failure');
      const handler = jest.fn().mockRejectedValue(failure);
      await registerWorker(QueueName.WEBHOOK_DELIVERY, handler);
      const workHandler = getWorkHandler();

      const rawJob = {
        id: 'job-3',
        name: QueueName.WEBHOOK_DELIVERY,
        data: { a: 1 },
        retryCount: 2,
        retryLimit: 2,
      };

      await expect(workHandler([rawJob])).rejects.toThrow('final failure');
      expect(mockAddFailedJob).not.toHaveBeenCalled();
    });
  });

  describe('dead-letter drain worker', () => {
    /** Pulls out the batch handler pg-boss would invoke for the dead-letter queue. */
    const getDlqDrainHandler = (): ((jobs: unknown[]) => Promise<void>) => {
      const call = mockBoss.work.mock.calls.find((c) => c[0] === DEAD_LETTER_QUEUE);
      return call[2];
    };

    it('maps sourceName/sourceId/sourceRetryCount to a NormalizedJob and writes it via addFailedJob, using the handler-throw output.message', async () => {
      await startQueues(pool);
      const drainHandler = getDlqDrainHandler();

      const dlqJob = {
        id: 'dlq-job-1',
        sourceName: QueueName.WEBHOOK_DELIVERY,
        sourceId: 'original-job-1',
        sourceRetryCount: 2,
        data: { webhookId: 'wh-1' },
        output: { name: 'Error', message: 'delivery endpoint refused connection', stack: 'stack...' },
        signal: {} as AbortSignal,
      };

      await drainHandler([dlqJob]);

      expect(mockAddFailedJob).toHaveBeenCalledTimes(1);
      const [normalizedArg, errorArg, queueNameArg] = mockAddFailedJob.mock.calls[0];
      expect(normalizedArg).toEqual({
        id: 'original-job-1',
        name: QueueName.WEBHOOK_DELIVERY,
        data: { webhookId: 'wh-1' },
        retryCount: 2,
        retryLimit: 2,
        signal: dlqJob.signal,
      });
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe('delivery endpoint refused connection');
      expect(queueNameArg).toBe(QueueName.WEBHOOK_DELIVERY);
    });

    it('falls back to id/name/retryCount 0 when source* fields are null (defensive - should not happen per pg-boss docs)', async () => {
      await startQueues(pool);
      const drainHandler = getDlqDrainHandler();

      const dlqJob = {
        id: 'dlq-job-2',
        sourceName: null,
        sourceId: null,
        sourceRetryCount: null,
        data: {},
        output: null,
      };

      await drainHandler([dlqJob]);

      const [normalizedArg] = mockAddFailedJob.mock.calls[0];
      expect(normalizedArg).toEqual({
        id: 'dlq-job-2',
        name: 'unknown',
        data: {},
        retryCount: 0,
        retryLimit: 2, // DEFAULT_RETRY_LIMIT fallback for an unrecognized source queue name
        signal: undefined,
      });
    });

    it('extracts the timeout-failure message shape ({ value: { message } }) by falling through to JSON.stringify', async () => {
      await startQueues(pool);
      const drainHandler = getDlqDrainHandler();

      const dlqJob = {
        id: 'dlq-job-3',
        sourceName: QueueName.PDF_PROCESSING,
        sourceId: 'original-job-3',
        sourceRetryCount: 1,
        data: {},
        output: { value: { message: 'job timed out' } },
      };

      await drainHandler([dlqJob]);

      const [, errorArg] = mockAddFailedJob.mock.calls[0];
      expect(errorArg.message).toBe(JSON.stringify({ value: { message: 'job timed out' } }));
    });

    it('falls back to a generic message when output is null/undefined (worker crash with no recorded output)', async () => {
      await startQueues(pool);
      const drainHandler = getDlqDrainHandler();

      const dlqJob = {
        id: 'dlq-job-4',
        sourceName: QueueName.CLEANUP,
        sourceId: 'original-job-4',
        sourceRetryCount: 0,
        data: {},
        output: null,
      };

      await drainHandler([dlqJob]);

      const [, errorArg] = mockAddFailedJob.mock.calls[0];
      expect(errorArg.message).toBe('job failed: expired or worker crashed');
    });

    it('does not throw when addFailedJob rejects (moveToDeadLetterQueue swallows its own write failures)', async () => {
      await startQueues(pool);
      mockAddFailedJob.mockRejectedValueOnce(new Error('db down'));
      const drainHandler = getDlqDrainHandler();

      await expect(
        drainHandler([
          {
            id: 'dlq-job-5',
            sourceName: QueueName.WEBHOOK_DELIVERY,
            sourceId: 'original-job-5',
            sourceRetryCount: 0,
            data: {},
            output: { message: 'boom' },
          },
        ])
      ).resolves.toBeUndefined();
    });
  });

  describe('moveToDeadLetterQueue', () => {
    it('logs and resolves without throwing when the queue system has not been started', async () => {
      const job: NormalizedJob = { id: 'job-4', name: 'x', data: {}, retryCount: 1, retryLimit: 1 };

      await expect(
        moveToDeadLetterQueue('some-queue', job, new Error('boom'))
      ).resolves.toBeUndefined();
      expect(mockAddFailedJob).not.toHaveBeenCalled();
    });

    it('swallows a DLQ write failure and resolves without throwing', async () => {
      await startQueues(pool);
      mockAddFailedJob.mockRejectedValueOnce(new Error('db down'));
      const job: NormalizedJob = { id: 'job-5', name: 'x', data: {}, retryCount: 1, retryLimit: 1 };

      await expect(
        moveToDeadLetterQueue('some-queue', job, new Error('boom'))
      ).resolves.toBeUndefined();
    });
  });

  describe('stopQueues', () => {
    it('calls boss.stop with graceful:true and a 20s timeout (leaving headroom in the 30s shutdown budget for the pool close), then clears the singleton', async () => {
      await startQueues(pool);

      await stopQueues();

      expect(mockBoss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 20000 });
      expect(() => getBoss()).toThrow(/not started/);
    });

    it('is a no-op when the queue system was never started', async () => {
      await stopQueues();

      expect(mockBoss.stop).not.toHaveBeenCalled();
    });
  });
});
