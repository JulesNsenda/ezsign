# Remove Redis → Postgres-only, revision 2 (plan of record)

**Date:** 2026-07-22 · **Status:** approved direction ("ship it"), panel-reviewed · **Supersedes:** `2026-07-12-remove-redis-postgres-only.md` (kept for history)

## Goal

EzSign runs on Postgres alone: BullMQ → **pg-boss v12** (not v10 — API verified against current docs), rate limiting → in-memory, JWT blacklist → Postgres. After this, a Drop deploy needs only `JWT_SECRET` + `DATABASE_URL`, and token revocation becomes real in production.

## Panel verdicts driving this revision

- The old plan's "same public surface wrapper" premise is **false** — call sites use `getJob/getState/progress/counts/Job.fromId/remove/repeatable APIs/worker events/updateProgress`, none of which pg-boss reproduces. This is a per-module port.
- Old single-table blacklist schema **cannot represent per-user session revocation** → logout-all/password-change revocation would silently no-op. Two tables required.
- Staged delivery, one stage = one commit set, Redis removal strictly last.
- `email` queue is dead code (5 live queues); `@nestjs/bullmq` is a dead dep.

## Key decisions

1. **Stage order**: (1) blacklist + rate limiting, (2) queues, (3) Redis eradication. Stage 3 gated on 1–2.
2. **Two revocation tables**: `revoked_tokens(jti text PK, expires_at timestamptz NOT NULL)` and `user_token_revocations(user_id uuid PK, revoked_at timestamptz NOT NULL, expires_at timestamptz NOT NULL)`. `isUserSessionRevoked` compares `iat <= revoked_at` (inclusive, second precision — closes the pre-existing race).
3. **Fail-closed reads** in `authenticate`/refresh for revocation checks (DB error ⇒ 401): with Postgres as the store, fail-open buys no availability and is pure bypass. Write side (blacklist on change-password/logout) stays best-effort try/catch.
4. **`tokenBlacklistService.init(pool)`** at bootstrap; method signatures unchanged (`blacklistToken`, `isBlacklisted`, `blacklistAllUserTokens`, `isUserSessionRevoked`, `close`). Uninitialized use throws (fail-closed), not silently passes.
5. **pg-boss shares the app pool** via its `db` adapter option — one connection budget (max 20), no second pool on Drop. Shutdown: single "queue system" resource calling `boss.stop({ graceful: true, timeout: 30000 })`, priority strictly before pool close (replaces 6 per-worker close registrations).
6. **Boot lifecycle**: `config/queue.ts` owns the PgBoss singleton. `await startQueues(pool)` in server bootstrap: `boss.start()`, `createQueue()` for each of the **5** queues (email deleted) with queue-level `retryLimit/retryDelay/retryBackoff/expireInSeconds/deleteAfterSeconds`, then `boss.schedule()` the 2 cleanup crons (distinct `key`s: `daily-full-cleanup`, `temp-cleanup-6h`). Service singletons become lazy — nothing queue-touching at module import (unit tests must not need a live DB).
7. **DLQ single-owner**: keep the existing `dead_letter_queue` table + admin routes. NO pg-boss `deadLetter` queues. Workers detect final failure in the handler catch via `work(..., { includeMetadata: true })` and `job.retryCount >= job.retryLimit`, then write a **normalized shape** (not `bullmq.Job`) to `deadLetterQueueService.addFailedJob`. DLQ `retryJob` re-enqueues via `boss.send`.
8. **Dedup/cancel**: BullMQ deterministic `jobId` is illegal in pg-boss (UUID only). Scheduled sends: `boss.send(..., { singletonKey: 'scheduled-send-'+documentId, ... })` or `upsert`; persist the **returned** UUID into `documents.schedule_job_id`. Reminders: persist returned UUID into `document_reminders.job_id`; cancel via `boss.cancel(name, id)`.
9. **Option mapping** (from the verified inventory): `attempts: N` → `retryLimit: N-1` (off-by-one!); backoff ms → `retryBackoff: true, retryDelay: <seconds>`; `delay` → pass the target `Date` to `sendAfter`/`startAfter`; `concurrency` → `localConcurrency`; `JOB_TIMEOUTS` → `expireInSeconds` (30/300/30/600/60 for the 5 live queues); `LOCK_DURATIONS`/`STALLED_CHECK_INTERVALS`/`drainDelay` have no analog — delete. **Priority values carry over unchanged**: pg-boss is higher-wins, which matches the code comments' stated intent (BullMQ was silently inverted).
10. **Retention mandated**: queue-level `deleteAfterSeconds: 604800` (7d, covers failed-job visibility; completed jobs need no count cap — payloads are verified ID-only, no secrets). Convention documented: job payloads stay ID-only.
11. **Accepted regressions** (documented, deliberate):
    - BullMQ `limiter` (webhook 100/s, pdf 5/s) has no pg-boss analog → dropped; `localConcurrency` + polling interval is the coarse ceiling. Revisit if webhook targets complain.
    - `job.updateProgress` → removed; `GET /api/pdf/jobs/:jobId` loses live progress %, returns pg-boss state mapped to legacy names where sensible (`created→waiting`, `retry→delayed`, `active→active`, `completed→completed`, `failed/cancelled→failed`) + `output` as result/failedReason; metrics endpoint uses `getQueueStats` (no completedCount).
    - In-memory rate limits reset per deploy and are per-process. Acceptable: single-instance Drop; the real login backstop is the DB-backed lockout (SEC-M7, still open in tasks-0041). Note: `authLimiter` is pre-existing dead code — global `apiLimiter` is the only login throttle; unchanged by this migration.
12. **Single-instance invariant documented** (rate limits + 2FA pending-login map are in-process; scaling to 2 instances breaks 2FA login and halves limits). README deployment note.
13. **Privileges**: pg-boss creates its `pgboss` schema at `start()`; on Drop the same role already runs node-pg-migrate DDL (`scripts/start-prod.js`), so no privilege escalation. Documented, accepted.

## Stage 1 — Blacklist + rate limiting (commit unit 1)

- [x] Migration: `revoked_tokens` + `user_token_revocations` (+ indexes on `expires_at`); down drops both.
- [x] `services/tokenBlacklistService.ts`: Postgres rewrite per decisions 2–4; expired-row cleanup piggybacked (`DELETE ... WHERE expires_at < now()` opportunistically on writes or via the cleanup job in Stage 2).
- [x] `middleware/auth.ts` + `authController.ts` refresh: revocation-check failures now 401 (flip the fail-open catches on READS only).
- [x] `middleware/rateLimiter.ts`: delete `RedisStore`/`getRedisStore`/`closeRateLimitRedis` + `store:` lines (7 limiters) → default in-memory store.
- [x] server.ts wiring (orchestrator): `tokenBlacklistService.init(pool)` before routes; remove `closeRateLimitRedis` shutdown hook.
- [x] Tests: update `__tests__/integration/auth.test.ts` mock rationale, `middleware/auth.test.ts`, `authController.test.ts` fail-closed expectations; new unit tests for the Postgres blacklist (both tables, `iat <= revoked_at` boundary, fail-closed read, best-effort write).

## Stage 2 — Queues → pg-boss (commit unit 2, the big one)

- [x] `npm i pg-boss` (backend); remove nothing yet.
- [x] `config/queue.ts` rewrite: PgBoss singleton on the app pool (`db` adapter), `startQueues(pool)` (start + createQueue ×5 + schedules), `stopQueues()`, typed helpers `enqueue(queue, data, opts)`, `registerWorker(queue, handler, opts)` (destructures the batch array, `includeMetadata: true`, normalizes job shape `{ id, data, retryCount, retryLimit }`), DLQ final-failure helper. Delete EMAIL queue, LOCK_DURATIONS, STALLED_CHECK_INTERVALS, getRedisConnection stays temporarily (rateLimiter import already gone in Stage 1; healthService still uses it until Stage 3 — verify and sequence).
- [x] Per-domain ports (each = service + worker pair, normalized DLQ writes, option mapping per decision 9):
  - webhook: `webhookService.ts` enqueue + `webhookWorker.ts`
  - pdf: `pdfQueueService.ts` (lazy singleton; job-status/metrics per decision 11) + `pdfWorker.ts` + `pdfController` status/metrics adaptation
  - scheduled-send: `scheduledSendService.ts` (singletonKey + returned-UUID persistence + cancel via boss.cancel) + `scheduledSendWorker.ts`
  - reminders: `reminderService.ts` (same UUID/cancel pattern) + `reminderWorker.ts`
  - cleanup: `cleanupWorker.ts` (schedules move into `startQueues`; manual-trigger via plain send)
  - DLQ: `deadLetterQueueService.ts` normalized `addFailedJob` shape + `retryJob` via `boss.send`
- [x] server.ts wiring (orchestrator): replace worker constructions + 6 shutdown registrations with `await startQueues(pool)` (in the bootstrap path, after DB connect) + one `stopQueues` shutdown resource above pool-close priority.
- [x] Tests: `__tests__/integration/webhook.test.ts` re-mock against the new wrapper; new unit tests for option mapping (attempts→retryLimit off-by-one, singletonKey dedup, DLQ final-failure detection, schedule registration).

## Stage 3 — Redis eradication (commit unit 3)

- [x] `healthService.ts` + `routes/health.ts`: drop `redis` from HealthStatus/ReadinessStatus/critical-dependency logic/error payloads; ctor loses the redis arg.
- [x] `server.ts`: remove `healthRedis`, `getRedisConnection` import, any remnants.
- [x] `config/queue.ts`: delete `getRedisConnection` and last ioredis traces.
- [x] `adminSettingsController.ts`: drop `redisConfigured` from the system block; `InstanceSettings.tsx`: System card shows storage + database only (remove the Redis row).
- [x] `package.json`: remove `bullmq`, `@nestjs/bullmq` (verified never imported), `ioredis`, `rate-limit-redis`, `redis`; lockfile sync.
- [x] docker-compose.yml / dev / prod: remove redis service, `depends_on: redis`, `REDIS_*` env, redis volume, redis-commander (dev).
- [x] `.env.example`, README (Redis references incl. yesterday's settings-feature text), `drop.yaml` header note, CLAUDE.md prerequisites line.
- [x] Memory/docs: launch-readiness + admin-bootstrap memories mention Redis caveats → update after ship.

## Gates

Per stage: build + targeted tests. After Stage 3: full Gate 2 (security + architecture critics on the complete diff), Gate 3 (test-runner, full suites + the coverage gaps called out: queue services/workers previously had zero tests), Gate 4 (runtime on a **Postgres-only** scratch stack — no Redis container: bootstrap admin, login, schedule+cancel a send, enqueue+process a webhook with DLQ path, cleanup crons registered, revocation fail-closed observed, rate limit trips, `GET /api/pdf/jobs/:jobId` shape).

## Risks

- pg-boss shares the app pool: `boss.stop()` must resolve before pool teardown (shutdown priority), and polling load counts against max 20 — watch `getQueueStats` under load at Gate 4.
- Blacklist adds 2 DB queries per authenticated request (was Redis O(1)). Accepted at Drop scale; revisit with an in-process short-TTL cache if p95 regresses.
- At-least-once redelivery semantics differ slightly; existing idempotency guards (e.g. scheduledSendWorker status re-check) cover it.
- API-visible changes: pdf job status/metrics shape, documented above.

## Agent critiques considered

- **Security critic**: two-table revocation schema (HIGH → adopted, decision 2); fail-closed reads (adopted, decision 3); retention + ID-only payload convention (adopted, decision 10 — verified no secrets in payloads today); single-instance invariant (adopted, decision 12); pgboss DDL privileges (verified same-role on Drop, documented); `iat <= revoked_at` (adopted); in-memory rate limiting accepted contingent on SEC-M7 note.
- **Architecture critic**: wrapper premise rejected → per-module port (adopted); staged PRs (adopted as staged commit units on this branch); boot lifecycle `startQueues` + lazy singletons (adopted); DLQ single-owner in-handler detection (adopted); singletonKey/UUID cancel semantics (adopted); shared-pool decision forced explicit (adopted, decision 5); limiter loss + progress loss flagged → accepted regressions (decision 11); health/System-card dropped not replaced (adopted); compose `depends_on` + dead `@nestjs/bullmq` (adopted).
- **Correctness auditor**: v12 not v10, mandatory `createQueue`, full option-mapping table incl. attempts off-by-one, backoff units, priority inversion, batch handler, `getQueueStats`, schedule keys (all adopted into decision 9); EMAIL queue dead code → deleted not ported; test inventory incl. the zero-coverage gap on queue services (folded into Gates).

## Implementation record (2026-07-23)

All three stages implemented; gates passed. Backend suite 27/27 suites (500 passed, 1 pre-existing skip), frontend 168 passed; runtime-verified on a Postgres-only scratch stack (no Redis container): boot via discrete-var DATABASE_URL derivation + migrations, admin bootstrap, 5 workers + 2 cron schedules registered, real token revocation (pre-change refresh token rejected), change-password tokens immediately usable against a real DB clock, thumbnail job enqueue→active→completed with reshaped status endpoint, in-memory rate limiter tripping 429, restart idempotency.

Amendments made during gates (supersede the original decisions where they conflict):
- **Decision 7 re-cut (Gate 2 architecture ship-blocker):** in-handler final-failure detection missed timeout/expiry and worker-crash failures (the old BullMQ `failed` event caught those). Now: every live queue sets `deadLetter: 'dead-letter'` (a shared infrastructure queue, not in QueueName); a drain worker registered in `startQueues` maps `sourceName`/`sourceId`/`sourceRetryCount`/`output` into the existing `dead_letter_queue` admin table. The in-handler DLQ write was deleted (single-owner, no double-writes). DLQ `retryJob` refuses scheduled-send/deadline-reminder entries (would fire immediately, bypass singletonKey, orphan the persisted job id).
- **Gate 4 runtime catch:** `enqueue` passed option keys with undefined values; pg-boss's validator asserts on key presence → every partial-options enqueue failed at runtime (mocked tests could not see this). Fixed by pruning undefined keys.
- **Gate 2 security MEDIUM:** user-revocation row TTL now derived from `JWT_REFRESH_TOKEN_EXPIRY` (was hardcoded 7d — an operator lengthening refresh lifetime would have reopened a revocation bypass).
- `getQueueStats` now forces a fresh reading (default is up-to-~1h cached); `boss.stop` timeout lowered to 20s inside the 30s shutdown budget; `registerWorker` returns the handler result so completed jobs store `output`; `NormalizedJob` exposes pg-boss's cooperative `AbortSignal` (documented, not yet consumed by workers); `authenticate` no longer echoes internal error messages; change-password's wait-past-second comment corrected (NTP assumption, not a skew guarantee).
- Stage 1 discovered interim fix (kept): inclusive `iat <= revoked_at` made change-password's fresh tokens born-revoked (same-second mint); `waitPastCurrentSecond` (≤~1.05s on that endpoint only) defers minting past the revocation second. Proper fix if ever needed: a token-version claim.
- Node bumped to 22 (Dockerfiles, engines, docs) — pg-boss 12 requires >=22.12.

Accepted residuals (documented): timeout-shape DLQ error messages render as JSON (`{"value":{"message":...}}`); in-memory rate limits reset per restart pending SEC-M7; jest maps pg-boss to a stub (type-check guards the compile contract, Gate 4 guards runtime).
