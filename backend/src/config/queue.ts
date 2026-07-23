import { PgBoss } from 'pg-boss';
import type { JobWithMetadata, QueueStats } from 'pg-boss';
import { Pool } from 'pg';
import logger from '@/services/loggerService';

/**
 * Queue names
 *
 * NOTE: the `email` queue from the BullMQ era was dead code (never enqueued
 * anywhere) and has been deleted rather than ported.
 */
export enum QueueName {
  PDF_PROCESSING = 'pdf-processing',
  WEBHOOK_DELIVERY = 'webhook-delivery',
  CLEANUP = 'cleanup',
  SCHEDULED_SEND = 'scheduled-send',
  DEADLINE_REMINDERS = 'deadline-reminders',
}

/**
 * Infrastructure queue for pg-boss's native dead-letter routing (Gate 2 fix
 * 1: pg-boss's own `deadLetter` queue option - not an in-handler
 * `retryCount >= retryLimit` check - is what detects a finally-failed job.
 * The old in-handler check only ever saw handler throws; it never saw a job
 * that failed by expiring (`expireInSeconds`) or by its worker process
 * crashing mid-handler, both of which pg-boss settles internally with no
 * handler code running at all. Each of the 5 live queues below is
 * configured with `deadLetter: DEAD_LETTER_QUEUE`; a worker (registered in
 * `startQueues`) drains that queue and forwards every job it sees into the
 * existing `dead_letter_queue` admin table via `moveToDeadLetterQueue`, so
 * the DLQ admin UI/routes remain the single place operators look regardless
 * of *why* the original job failed.
 *
 * Deliberately NOT a QueueName member: it's plumbing between pg-boss and the
 * admin DLQ table, not a queue any domain service ever calls `enqueue`
 * against directly.
 */
export const DEAD_LETTER_QUEUE = 'dead-letter';

/**
 * Job timeout configuration per queue, in SECONDS (pg-boss `expireInSeconds`).
 * This replaces the old BullMQ `JOB_TIMEOUTS` (which was in milliseconds) —
 * values below carry over the same wall-clock timeouts as the BullMQ config.
 * `LOCK_DURATIONS` / `STALLED_CHECK_INTERVALS` have no pg-boss analog
 * (pg-boss uses `expireInSeconds` + retry for stalled/expired jobs) and have
 * been deleted rather than ported.
 */
export const JOB_TIMEOUTS: Record<QueueName, number> = {
  [QueueName.PDF_PROCESSING]: 300, // 5 minutes - PDF processing can take time
  [QueueName.WEBHOOK_DELIVERY]: 30, // 30 seconds - webhook calls should timeout
  [QueueName.CLEANUP]: 600, // 10 minutes - cleanup can process many files
  [QueueName.SCHEDULED_SEND]: 60, // 1 minute - scheduling should be fast
  [QueueName.DEADLINE_REMINDERS]: 60, // 1 minute - sending reminders
};

/** Queue-level default retry policy (decision 9: `attempts: 3` -> `retryLimit: 2`, off-by-one). */
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_RETRY_DELAY_SECONDS = 1;

/** Cleanup queue overrides the default retry delay (was 60s backoff under BullMQ). */
const CLEANUP_RETRY_LIMIT = 2;
const CLEANUP_RETRY_DELAY_SECONDS = 60;

/**
 * Per-queue retryLimit, keyed the same way the `createQueue` loop in
 * `startQueues` sets it. The dead-letter drain worker needs this table too:
 * a job that reaches DEAD_LETTER_QUEUE carries `sourceRetryCount` (how many
 * retries the original job consumed) but not the *limit* its source queue
 * was configured with, and `NormalizedJob.retryLimit` is part of the DLQ
 * admin record written by `moveToDeadLetterQueue`.
 */
const RETRY_LIMITS: Record<QueueName, number> = {
  [QueueName.PDF_PROCESSING]: DEFAULT_RETRY_LIMIT,
  [QueueName.WEBHOOK_DELIVERY]: DEFAULT_RETRY_LIMIT,
  [QueueName.CLEANUP]: CLEANUP_RETRY_LIMIT,
  [QueueName.SCHEDULED_SEND]: DEFAULT_RETRY_LIMIT,
  [QueueName.DEADLINE_REMINDERS]: DEFAULT_RETRY_LIMIT,
};

/** Decision 10: 7-day retention for all queues; payloads are ID-only, no secrets. */
const DELETE_AFTER_SECONDS = 604800;

/**
 * Dead-letter queue's own retry/expire policy (Gate 2 fix 1b) - independent
 * of, and deliberately tighter than, the live queues' policy: a drain-worker
 * failure (e.g. a transient DB error writing to the admin table) should
 * retry quickly and give up sooner than a real domain job would.
 */
const DLQ_RETRY_LIMIT = 2;
const DLQ_RETRY_DELAY_SECONDS = 5;
const DLQ_EXPIRE_IN_SECONDS = 60;

/** Decision 6: distinct schedule keys so `boss.schedule()` is idempotent across restarts. */
const DAILY_FULL_CLEANUP_SCHEDULE_KEY = 'daily-full-cleanup';
const TEMP_CLEANUP_SCHEDULE_KEY = 'temp-cleanup-6h';

/**
 * pg-boss singleton + the app pool it shares (decision 5: one connection
 * budget, no second pool). Both are set together in `startQueues` and
 * cleared together in `stopQueues`. Nothing here connects at module import
 * time — the PgBoss instance is constructed lazily inside `startQueues`.
 */
let boss: PgBoss | null = null;
let sharedPool: Pool | null = null;

/**
 * Build a human-readable error message from a dead-lettered job's `output`
 * (Gate 2 fix 1c). pg-boss populates `output` differently depending on why
 * the source job failed - a handler throw serializes the Error's own
 * `message`/`stack`/`name` (via the `serialize-error` package pg-boss
 * depends on), while an expire/heartbeat timeout stores a fixed
 * `{ value: { message: '...' } }` shape (see node_modules/pg-boss/dist/
 * plans.js's `failJobsByTimeout` / `failJobsByHeartbeat`). Rather than chase
 * every internal pg-boss output shape, only the common top-level `.message`
 * case is special-cased; anything else - including that nested timeout
 * shape - falls through to a JSON.stringify of the whole value, which still
 * reads fine in the DLQ admin UI.
 */
const describeDeadLetterFailure = (output: unknown): string => {
  if (
    output &&
    typeof output === 'object' &&
    typeof (output as { message?: unknown }).message === 'string'
  ) {
    return (output as { message: string }).message;
  }

  if (output) {
    try {
      return JSON.stringify(output);
    } catch {
      return 'job failed: expired or worker crashed';
    }
  }

  return 'job failed: expired or worker crashed';
};

/**
 * Boot the pg-boss singleton on the shared app pool, create the dead-letter
 * queue plus the 5 live queues, register the dead-letter drain worker, and
 * register the 2 recurring cleanup schedules.
 *
 * Idempotent by construction: pg-boss's `createQueue` is `INSERT ... ON
 * CONFLICT DO NOTHING` and `schedule` is `INSERT ... ON CONFLICT (name, key)
 * DO UPDATE`, so re-running this against an already-provisioned database is
 * safe. This function itself is a no-op if the singleton is already started.
 */
export const startQueues = async (pool: Pool): Promise<void> => {
  if (boss) {
    logger.warn('startQueues called but the queue system is already started');
    return;
  }

  const instance = new PgBoss({
    db: {
      executeSql: (text: string, values?: unknown[]) => pool.query(text, values),
    },
  });

  instance.on('error', (error: Error) => {
    logger.error('pg-boss error', { error: error.message });
  });

  instance.on('warning', (warning) => {
    logger.warn('pg-boss warning', { message: warning.message, data: warning.data });
  });

  await instance.start();

  // Gate 2 fix 1b/1c: the dead-letter queue must exist BEFORE any queue
  // references it via `deadLetter:` - pg-boss's createQueue validates the
  // target queue is already provisioned (node_modules/pg-boss/dist/
  // manager.js's createQueue: `if (options.deadLetter) { ... await
  // this.getQueueCache(options.deadLetter) }`, which throws for an unknown
  // queue). No `deadLetter` of its own - this queue is the end of the line.
  // pg-boss's createQueue is INSERT ... ON CONFLICT DO NOTHING: it will NOT
  // apply changed options to a queue that already exists (verified at runtime
  // - the deadLetter routing silently never landed on a pre-provisioned
  // database). createQueue-then-updateQueue makes boot CONVERGENT: options
  // drift on existing deployments heals on every start.
  const dlqOptions = {
    retryLimit: DLQ_RETRY_LIMIT,
    retryDelay: DLQ_RETRY_DELAY_SECONDS,
    retryBackoff: true,
    expireInSeconds: DLQ_EXPIRE_IN_SECONDS,
    deleteAfterSeconds: DELETE_AFTER_SECONDS,
  };
  await instance.createQueue(DEAD_LETTER_QUEUE, dlqOptions);
  await instance.updateQueue(DEAD_LETTER_QUEUE, dlqOptions);

  for (const queueName of Object.values(QueueName)) {
    const isCleanup = queueName === QueueName.CLEANUP;

    const queueOptions = {
      retryLimit: RETRY_LIMITS[queueName],
      retryDelay: isCleanup ? CLEANUP_RETRY_DELAY_SECONDS : DEFAULT_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      expireInSeconds: JOB_TIMEOUTS[queueName],
      deleteAfterSeconds: DELETE_AFTER_SECONDS,
      // Gate 2 fix 1a/1b: route every finally-failed job (handler throw,
      // timeout-expiry, or worker crash) into DEAD_LETTER_QUEUE natively -
      // see the drain worker registered below.
      deadLetter: DEAD_LETTER_QUEUE,
    };
    await instance.createQueue(queueName, queueOptions);
    await instance.updateQueue(queueName, queueOptions);
  }

  // Recurring cleanup schedules (moved here from cleanupWorker.ts's
  // scheduleCleanupJobs per the Stage 2 checklist). Payloads/type
  // discriminators carried over EXACTLY from CleanupJobType in
  // workers/cleanupWorker.ts ('full_cleanup' / 'temp_files') - do not rename
  // without updating that enum too.
  await instance.schedule(
    QueueName.CLEANUP,
    '0 3 * * *', // 3 AM every day
    { type: 'full_cleanup', maxAgeHours: 24 },
    { key: DAILY_FULL_CLEANUP_SCHEDULE_KEY },
  );

  await instance.schedule(
    QueueName.CLEANUP,
    '0 */6 * * *', // Every 6 hours
    { type: 'temp_files', maxAgeHours: 6 },
    { key: TEMP_CLEANUP_SCHEDULE_KEY },
  );

  // Set the singleton BEFORE registering the drain worker below: moveToDeadLetterQueue
  // reads `sharedPool` (module-level), and once `instance.work` resolves, pg-boss can
  // start delivering jobs to it on its own polling timer.
  boss = instance;
  sharedPool = pool;

  // Gate 2 fix 1c: drain DEAD_LETTER_QUEUE into the admin dead_letter_queue
  // table. Registered directly against `instance.work` (not the
  // `registerWorker` wrapper below) since this is infra plumbing, not a
  // domain job handler, and needs the raw `JobWithMetadata` (for
  // sourceName/sourceId/sourceRetryCount) rather than the NormalizedJob
  // shape domain handlers get.
  await instance.work(
    DEAD_LETTER_QUEUE,
    { includeMetadata: true },
    async (jobs: JobWithMetadata<unknown>[]) => {
      for (const job of jobs) {
        const sourceName = job.sourceName ?? 'unknown';
        const normalized: NormalizedJob = {
          id: job.sourceId ?? job.id,
          name: sourceName,
          data: job.data,
          retryCount: job.sourceRetryCount ?? 0,
          retryLimit: RETRY_LIMITS[sourceName as QueueName] ?? DEFAULT_RETRY_LIMIT,
          signal: job.signal,
        };

        try {
          await moveToDeadLetterQueue(
            sourceName,
            normalized,
            new Error(describeDeadLetterFailure(job.output)),
          );
        } catch (error) {
          logger.error('Dead letter drain handler failed', {
            jobId: job.id,
            sourceName,
            error: (error as Error).message,
          });
          throw error;
        }
      }
    },
  );

  logger.info('Queue system started', { queues: Object.values(QueueName) });
};

/**
 * Gracefully stop the pg-boss singleton. Priority: this must resolve BEFORE
 * the app pool is closed (decision 5) - the shutdown orchestrator in
 * server.ts is responsible for sequencing that.
 *
 * pg-boss never closes `sharedPool` itself: it only closes a database
 * adapter it constructed internally (tagged `_pgbdb`), never a caller-
 * supplied `db` adapter like the one wired up in `startQueues`.
 */
export const stopQueues = async (): Promise<void> => {
  if (!boss) {
    return;
  }

  // 20s, not 30s (Gate 2 fix 1h): the global ShutdownManager budget for the
  // *entire* shutdown sequence is 30000ms total (services/shutdownManager.ts's
  // `new ShutdownManager(30000)`), and resources close sequentially by
  // priority within that single race. This resource must leave headroom for
  // the pool-close step that runs after it (decision 5's priority ordering)
  // rather than consuming the whole budget itself.
  await boss.stop({ graceful: true, timeout: 20000 });

  boss = null;
  sharedPool = null;

  logger.info('Queue system stopped');
};

/**
 * Get the running pg-boss singleton. Throws if `startQueues` has not been
 * called yet (fail fast rather than silently no-op against a null boss).
 */
export const getBoss = (): PgBoss => {
  if (!boss) {
    throw new Error('Queue system not started - call startQueues() before using the queue system');
  }
  return boss;
};

/**
 * Options accepted by `enqueue`. Kept as a small curated subset of pg-boss's
 * `SendOptions` - the domain-port services should not need the full surface.
 */
export interface EnqueueOptions {
  startAfter?: Date;
  singletonKey?: string;
  priority?: number;
  retryLimit?: number;
  retryDelay?: number;
}

/**
 * Enqueue a job. Returns the pg-boss-generated job UUID, or `null` when a
 * `singletonKey` dedupe suppressed the send (decision 8: BullMQ's
 * deterministic `jobId` is illegal in pg-boss - callers that need to
 * cancel/track a job later must persist this returned UUID themselves).
 */
export const enqueue = async (
  queue: QueueName,
  data: object,
  opts?: EnqueueOptions,
): Promise<string | null> => {
  const instance = getBoss();

  // pg-boss's argument validation asserts on option keys that are PRESENT,
  // even when their value is undefined - only include keys the caller set.
  const sendOptions: Parameters<PgBoss['send']>[2] = {};
  if (opts?.startAfter !== undefined) sendOptions.startAfter = opts.startAfter;
  if (opts?.singletonKey !== undefined) sendOptions.singletonKey = opts.singletonKey;
  if (opts?.priority !== undefined) sendOptions.priority = opts.priority;
  if (opts?.retryLimit !== undefined) sendOptions.retryLimit = opts.retryLimit;
  if (opts?.retryDelay !== undefined) sendOptions.retryDelay = opts.retryDelay;

  return instance.send(queue, data, sendOptions);
};

/**
 * Cancel a queued/active job by its pg-boss UUID (decision 8).
 */
export const cancelJob = async (queue: QueueName, jobId: string): Promise<void> => {
  const instance = getBoss();
  await instance.cancel(queue, jobId);
};

/**
 * Look up a single job with full metadata (state, output, retryCount,
 * createdOn/startedOn/completedOn, ...) by id, or `null` if it doesn't
 * exist. Uses `findJobs` - the non-deprecated v12 replacement for the
 * deprecated `getJobById`.
 */
export const findJob = async (
  queue: QueueName,
  jobId: string,
): Promise<JobWithMetadata<unknown> | null> => {
  const instance = getBoss();
  const jobs = await instance.findJobs<unknown>(queue, { id: jobId });
  return jobs[0] ?? null;
};

/**
 * Passthrough to pg-boss's `getQueueStats` (decision 11: no `completedCount`
 * equivalent exists in pg-boss - callers previously relying on that BullMQ
 * metric must adapt to this shape instead).
 */
export const getQueueStats = async (queue: QueueName): Promise<QueueStats[]> => {
  const instance = getBoss();
  // { force: true } (Gate 2 fix 1g): recompute a fresh reading instead of
  // serving pg-boss's queue-table cache, which (with `persistQueueStats`
  // off, as here) can otherwise be up to ~1h stale - see pg-boss's
  // `QueueStatsOptions.force` doc comment in types.d.ts. Forced calls made
  // within the same minute still reuse pg-boss's own short-lived cache, so
  // this doesn't turn frequent polling into a full aggregate every call.
  return instance.getQueueStats(queue, { force: true });
};

/**
 * A job normalized to the fields workers/services actually need, decoupled
 * from pg-boss's `JobWithMetadata` shape (and from the old `bullmq.Job`
 * shape it replaces). This is the contract domain-port worker handlers are
 * written against.
 */
export interface NormalizedJob {
  id: string;
  name: string;
  data: unknown;
  retryCount: number;
  retryLimit: number;
  /**
   * The originating pg-boss job's abort signal (Gate 2 fix 1f), passed
   * through unchanged. pg-boss's `work()` always populates this on every
   * fetched job (node_modules/pg-boss/dist/manager.js's `#processJobs`:
   * `jobs.forEach(job => { job.signal = ac.signal })`) and aborts it when
   * the job's `expireInSeconds` elapses or its worker is stopped
   * gracefully. Optional here (unlike on the underlying pg-boss `Job` type,
   * where it's required) because the dead-letter drain handler synthesizes
   * a NormalizedJob from a *different* job's metadata (the DLQ job, not the
   * original one that failed), where a fresh signal isn't meaningful.
   *
   * Cancellation is cooperative: no worker in this codebase currently reads
   * `signal`, so a handler that's already running keeps running to
   * completion even after pg-boss has marked its job failed/retried on
   * timeout. Consuming it (e.g. passing it to an in-flight fetch/child
   * process) is future work, not implemented by this fix.
   */
  signal?: AbortSignal;
}

export interface RegisterWorkerOptions {
  localConcurrency?: number;
}

/**
 * Register a handler for a queue. Wraps `boss.work(..., { includeMetadata:
 * true })`, destructures the fetched batch, and invokes `handler` once per
 * job, sequentially, normalizing each job to `NormalizedJob` first.
 *
 * Dead-lettering is no longer detected here (Gate 2 fix 1d): each live
 * queue is created with `deadLetter: DEAD_LETTER_QUEUE` (see `startQueues`),
 * so pg-boss itself routes a finally-failed job - whether it failed via a
 * handler throw, an `expireInSeconds` timeout, or its worker crashing -
 * into DEAD_LETTER_QUEUE natively. A separate drain worker (also registered
 * in `startQueues`) is the single place that writes to the admin
 * `dead_letter_queue` table. This function's only job on a handler throw is
 * to rethrow, so pg-boss marks the job failed (or retries it, if attempts
 * remain) - it must NOT also write to the DLQ, or every finally-failed job
 * would be double-written (once by this path, once by the drain worker).
 */
export const registerWorker = async (
  queue: QueueName,
  handler: (job: NormalizedJob) => Promise<unknown>,
  opts?: RegisterWorkerOptions,
): Promise<string> => {
  const instance = getBoss();

  return instance.work(
    queue,
    {
      includeMetadata: true,
      localConcurrency: opts?.localConcurrency,
    },
    async (jobs: JobWithMetadata<unknown>[]) => {
      let result: unknown;

      for (const job of jobs) {
        const normalized: NormalizedJob = {
          id: job.id,
          name: job.name,
          data: job.data,
          retryCount: job.retryCount,
          retryLimit: job.retryLimit,
          signal: job.signal,
        };

        result = await handler(normalized);
      }

      // batchSize is never overridden here (defaults to 1), so `jobs`
      // always holds exactly one job - returning its result lets pg-boss's
      // own work()->complete() call store it as that job's `output` (Gate 2
      // fix 1e; see node_modules/pg-boss/dist/manager.js's `#processJobs`:
      // `this.complete(name, jobIds, jobIds.length === 1 ? result :
      // undefined)`). If batchSize were ever raised above 1 here, pg-boss
      // would silently drop per-job outputs unless `perJobResults: true`
      // is also opted into (not used here) - keep batchSize at 1, or add
      // that.
      return result;
    },
  );
};

/**
 * Write a finally-failed job to the admin Dead Letter Queue table (decision
 * 7, revised at Gate 2: DLQ remains single-owner via the existing
 * `dead_letter_queue` table + admin routes, but the *detector* is now
 * pg-boss's native `deadLetter` queue option rather than an in-handler
 * `retryCount >= retryLimit` check - see `startQueues`'s DEAD_LETTER_QUEUE
 * drain worker, this function's only caller). Best-effort: a failure
 * writing to the admin table is logged here, but the drain worker's own
 * try/catch is what decides whether to rethrow (so pg-boss retries
 * delivering that dead-lettered job again later).
 */
export const moveToDeadLetterQueue = async (
  queueName: string,
  job: NormalizedJob,
  error: Error,
): Promise<void> => {
  if (!sharedPool) {
    logger.error('Cannot write to Dead Letter Queue - queue system not started', {
      queueName,
      jobId: job.id,
    });
    return;
  }

  try {
    // Dynamically imported to avoid a circular dependency at module load time.
    const { DeadLetterQueueService } = await import('@/services/deadLetterQueueService');
    const dlqService = new DeadLetterQueueService(sharedPool);

    await dlqService.addFailedJob(job, error, queueName);
  } catch (dlqError) {
    logger.error('Failed to write job to Dead Letter Queue', {
      queueName,
      jobId: job.id,
      error: (dlqError as Error).message,
    });
  }
};
