# ezsign: remove Redis → Postgres-only (deployable on DROP)

**Date:** 2026-07-12
**Status:** SUPERSEDED by 2026-07-22-remove-redis-postgres-only-r2.md (panel-reviewed revision)
**Why:** DROP provisions Postgres but not Redis. ezsign currently needs Redis for
job queues, rate limiting, and JWT blacklisting. Since ezsign already runs on
Postgres, moving these three concerns to Postgres (or in-memory) lets it deploy
on DROP with zero external services.

## Redis surface today (verified)
- **Job queues (BullMQ)** — `config/queue.ts` (`getRedisConnection`, `createQueue`,
  `createWorker`), 6 queues (`email`, `pdf-processing`, `webhook-delivery`,
  `cleanup`, `scheduled-send`, `deadline-reminders`), 5 workers under `workers/`,
  and a Postgres-backed DLQ (`deadLetterQueueService` — already Postgres).
- **Rate limiting** — `middleware/rateLimiter.ts` via `rate-limit-redis` `RedisStore`.
- **JWT blacklist** — `services/tokenBlacklistService.ts` via raw `ioredis` (set/get/TTL).
- **Health** — `services/healthService.ts` / `server.ts` ping Redis.
- Deps to drop: `bullmq`, `@nestjs/bullmq`, `ioredis`, `rate-limit-redis`, `redis`.
- `pg` present; `pg-boss` NOT present.

## Workstream 1 — Queues: BullMQ → pg-boss (the big piece)
- Add `pg-boss` (Postgres job queue). One `PgBoss(DATABASE_URL)` instance started
  at boot (creates its own `pgboss` schema — the DB role must be able to).
- Rewrite `config/queue.ts` to keep the SAME public surface so call sites barely
  change:
  - `createQueue(name)` → wrapper whose `.add(jobName, data, opts)` calls
    `boss.send(name, data, {...})`.
  - `createWorker(name, processor, opts)` → `boss.work(name, handler)` adapting
    pg-boss's job to the existing `processor(job)` shape (`job.data`).
  - Map options: `attempts`→`retryLimit`, `backoff`→`retryBackoff`,
    `JOB_TIMEOUTS`→`expireInSeconds`, `removeOnComplete/Fail`→pg-boss archive/
    retention.
  - **Repeatable/scheduled jobs** (scheduled-send, deadline-reminders): if they
    use BullMQ repeatable jobs today, map to `boss.schedule(name, cron)`. **Verify
    first** — this is the trickiest mapping.
  - DLQ: keep the existing Postgres DLQ table; wire pg-boss `onFail`/dead-letter
    to `deadLetterQueueService` (mostly reusable).
- Update the 5 workers + enqueue sites to the (compatible) wrapper.

## Workstream 2 — Rate limiting → in-memory
- `middleware/rateLimiter.ts`: remove `RedisStore`/`getRedisStore` and the `store:`
  option → express-rate-limit's default in-memory store. Acceptable: DROP runs a
  single instance per app, so per-process limits are fine. Remove `rate-limit-redis`.

## Workstream 3 — JWT blacklist → Postgres
- Migration: `revoked_tokens(jti text primary key, expires_at timestamptz not null)`
  + index on `expires_at`.
- Rewrite `tokenBlacklistService.ts`: ioredis set/get/TTL → Postgres upsert/select;
  periodic cleanup of expired rows (reuse the `cleanup` queue).

## Workstream 4 — Cleanup
- Remove the Redis health check (`healthService.ts`/`server.ts`).
- Remove the five Redis deps and `REDIS_*` env vars from `.env.example`/config.
- Drop the `redis` service from docker-compose (optional; DROP ignores compose).

## Risks
- **pg-boss semantics ≠ BullMQ**: concurrency (`teamSize`/`batchSize`), visibility
  timeout, retry/backoff, and especially **cron/repeatable** jobs map differently.
- pg-boss creates a schema — needs a DB role with `CREATE` on the database.
- Integration tests that assume Redis (`__tests__/integration/webhook.test.ts`,
  `auth.test.ts`) must be updated.

## Verification
- ezsign jest suite (unit + integration) green after updates.
- Manual: boot backend against a plain Postgres, enqueue one job per queue, confirm
  processing; verify rate-limit + token-revocation still work.

## Scope
~15 files, moderate–high risk (core signing workflow). Best done on its own branch
with the test suite as the gate — not folded into an unrelated change.

## Addendum — currency check (2026-07-22)

Verified against the codebase after the admin-bootstrap/instance-settings feature landed:

- **Repeatable-jobs question answered**: only `cleanupWorker.ts` uses BullMQ repeatable/cron jobs (`getRepeatableJobs` + `repeat:`) → maps to `boss.schedule()`. scheduled-send and deadline-reminders use ordinary/delayed jobs → `boss.send(..., { startAfter })`. The "trickiest mapping" is confined to one worker.
- **Consumer surface**: 16 non-test files reference queue/blacklist/redis primitives — matches the ~15-file estimate.
- **New touch points since 2026-07-12** (add to Workstream 4):
  - `adminSettingsController.ts:15` reports `redisConfigured` and `InstanceSettings.tsx` renders it in the System card → replace with a queue-health indicator (pg-boss) or drop.
  - `authController.refresh` and `middleware/auth.ts` now call `tokenBlacklistService.isBlacklisted`/`isUserSessionRevoked` (added 2026-07-22) → Workstream 3 must preserve the service's public API exactly so these callers don't change.
  - `drop.yaml` header notes Redis as a deploy prerequisite → update once this lands.
  - README/`.env.example` gained settings-feature text mentioning Redis for queues → update.
- **pg-boss schema note**: DROP's provisioned DB role must be able to `CREATE SCHEMA`; the new `scripts/start-prod.js` migration step is unrelated (node-pg-migrate) — pg-boss creates its own schema at `boss.start()`.
