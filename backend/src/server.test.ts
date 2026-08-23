/**
 * `server.ts` has no test file - it is an application entry point with heavy
 * import-time side effects (a real `pg` Pool connection attempt that calls
 * `process.exit(1)` on failure, pg-boss queue startup, worker registration,
 * admin bootstrap, an actual `httpServer.listen(...)`). This file mocks all
 * of those out so the module can be imported safely, purely to exercise the
 * CORS middleware's header-set behavior that changed in this diff: an
 * allowed origin gets the full CORS header set, a disallowed origin gets
 * none at all (previously Allow-Methods/Headers/Credentials were emitted
 * unconditionally, only Allow-Origin was gated).
 *
 * The CORS *ordering* change (moved above body-parsing/rate-limiting) is not
 * covered here - that's an HTTP dispatch-order behavior, not this
 * middleware's own logic, and belongs with the plan's runtime verification
 * rather than a unit test in this file.
 */

// PORT=0 before the import - dotenv.config() does not override an
// already-set env var, and this avoids both a fixed-port collision and an
// unnecessary real listener on a well-known port.
process.env.PORT = '0';

// `uuid` ships ESM-only (see jest.config.js's moduleNameMapper comment for
// the same issue with `pg-boss`) - ts-jest can't parse it, and
// `middleware/correlationId.ts` (a direct import of `server.ts`) imports it.
// Mocked here rather than in the shared jest config, since this is the only
// suite that transitively imports `server.ts` itself.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

jest.mock('pg', () => {
  return {
    Pool: jest.fn().mockImplementation(() => ({
      // `server.ts`'s `pool.connect((err, client, release) => ...)` calls
      // `process.exit(1)` on error - this must never fire in a test.
      connect: jest.fn((cb: (err: Error | null, client: unknown, release: () => void) => void) =>
        cb(null, {}, jest.fn())
      ),
      query: jest.fn().mockResolvedValue({ rows: [] }),
      on: jest.fn(),
      end: jest.fn((cb?: () => void) => cb?.()),
    })),
  };
});

jest.mock('@/services/socketService', () => ({
  socketService: {
    initialize: jest.fn(),
    getIO: jest.fn(),
  },
}));

jest.mock('@/services/adminBootstrapService', () => ({
  ensureAdminExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/config/queue', () => ({
  startQueues: jest.fn().mockResolvedValue(undefined),
  stopQueues: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/workers/webhookWorker', () => ({ createWebhookWorker: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/workers/pdfWorker', () => ({ createPdfWorker: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/workers/cleanupWorker', () => ({ createCleanupWorker: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/workers/scheduledSendWorker', () => ({ createScheduledSendWorker: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/workers/reminderWorker', () => ({ createReminderWorker: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@/services/databaseService', () => ({
  createMonitoredPool: jest.fn((pool: unknown) => pool),
  logQueryStatsSummary: jest.fn(),
}));

jest.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    init: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/fieldTableService', () => ({
  initializeFieldTableService: jest.fn(),
}));

jest.mock('@/services/shutdownManager', () => ({
  shutdownManager: {
    register: jest.fn(),
    installSignalHandlers: jest.fn(),
  },
}));

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('server.ts CORS middleware (header-set behavior)', () => {
  // Express doesn't expose a friendly name for an anonymous middleware, so
  // find the CORS layer by matching its source text for something only it
  // contains, the same style used for direct-invocation tests elsewhere in
  // this suite (e.g. `errorHandler.test.ts` calls `errorHandler(...)`
  // directly rather than dispatching a real HTTP request through Express).
  function findCorsLayer(app: import('express').Express) {
    // Express 5 renamed `app._router` to `app.router` (the old `_router` is
    // gone, not just deprecated).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stack = (app as any).router.stack as Array<{ handle: (...args: unknown[]) => void }>;
    const layer = stack.find((l) => l.handle.toString().includes('Access-Control-Allow-Origin'));
    if (!layer) {
      throw new Error('Could not locate the CORS middleware layer on the app - server.ts may have changed shape');
    }
    return layer.handle;
  }

  function makeReqRes(origin: string | undefined) {
    const headers: Record<string, string> = {};
    const req: any = { headers: origin ? { origin } : {}, method: 'GET' };
    const res: any = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      sendStatus: jest.fn(),
      _headers: headers,
    };
    const next = jest.fn();
    return { req, res, next, headers };
  }

  it('sets the full CORS header set for an allowed origin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('./server').default;
    const corsMiddleware = findCorsLayer(app);

    const { req, res, next, headers } = makeReqRes('http://localhost:5173');
    corsMiddleware(req, res, next);

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers['Vary']).toBe('Origin');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization, X-API-Key');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(next).toHaveBeenCalled();
  });

  it('sets no CORS headers at all for a disallowed origin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('./server').default;
    const corsMiddleware = findCorsLayer(app);

    const { req, res, next, headers } = makeReqRes('https://evil.example.com');
    corsMiddleware(req, res, next);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Vary']).toBeUndefined();
    expect(headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(headers['Access-Control-Allow-Headers']).toBeUndefined();
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('short-circuits an allowed-origin OPTIONS preflight with 200, without calling next', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('./server').default;
    const corsMiddleware = findCorsLayer(app);

    const { req, res, next, headers } = makeReqRes('http://localhost:5173');
    req.method = 'OPTIONS';
    corsMiddleware(req, res, next);

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls through a disallowed-origin OPTIONS preflight to next() with no CORS headers (not a 200 short-circuit)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('./server').default;
    const corsMiddleware = findCorsLayer(app);

    const { req, res, next, headers } = makeReqRes('https://evil.example.com');
    req.method = 'OPTIONS';
    corsMiddleware(req, res, next);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

/**
 * A PostgreSQL restart must not take the app down with it.
 *
 * node-postgres emits 'error' on the Pool when a client sitting IDLE loses its
 * connection, and an unhandled one crashes the process. Before this handler
 * existed that surfaced as an uncaughtException, which shutdownManager treats
 * as fatal — so on 2026-07-30 at 14:03 UTC, when PostgreSQL was restarted
 * underneath the app and every pooled connection got
 * `57P01 terminating connection due to administrator command`, the backend shut
 * itself down cleanly and never came back. The platform bounces PostgreSQL on
 * every deploy, so it was certain to recur.
 */
describe('server.ts database pool resilience', () => {
  /**
   * A PostgreSQL restart must not take the app down with it.
   *
   * node-postgres emits 'error' on the Pool when a client sitting IDLE loses
   * its connection, and its docs are explicit that an unhandled one crashes
   * the process. Before the handler existed that surfaced as an
   * uncaughtException, which shutdownManager treats as fatal — so on
   * 2026-07-30 at 14:03 UTC, when PostgreSQL was restarted underneath the app
   * and every pooled connection got `57P01 terminating connection due to
   * administrator command`, the backend shut itself down cleanly and never
   * came back. The platform bounces PostgreSQL on every deploy, so it was
   * certain to recur.
   *
   * These tests re-import `server.ts` behind their own `pg` mock rather than
   * reusing the suite-level one: jest.config sets clearMocks/resetMocks, which
   * wipes the shared mock's implementation and call history between tests, so
   * the module-load that actually constructs the Pool is not observable from
   * here otherwise.
   */
  function loadServerCapturingPoolHandlers(): {
    handlers: Map<string, (err: Error & { code?: string }) => void>;
    logger: { error: jest.Mock };
  } {
    const handlers = new Map<string, (err: Error & { code?: string }) => void>();
    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn() };

    jest.resetModules();
    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        on: (event: string, cb: (err: Error & { code?: string }) => void) => {
          handlers.set(event, cb);
        },
        connect: jest.fn((cb: (e: Error | null, c: unknown, r: () => void) => void) => cb(null, {}, jest.fn())),
        query: jest.fn().mockResolvedValue({ rows: [] }),
        end: jest.fn((cb?: () => void) => cb?.()),
      })),
    }));
    jest.doMock('@/services/loggerService', () => ({ __esModule: true, default: loggerMock }));

    require('./server');
    return { handlers, logger: loggerMock };
  }

  it('attaches an error handler to the pool', () => {
    const { handlers } = loadServerCapturingPoolHandlers();
    expect(handlers.has('error')).toBe(true);
  });

  it('absorbs an idle-client error instead of letting it become an uncaughtException', () => {
    const { handlers, logger } = loadServerCapturingPoolHandlers();
    const handler = handlers.get('error');
    expect(typeof handler).toBe('function');

    // The exact error PostgreSQL sends when restarted under a live pool.
    const pgRestart = Object.assign(
      new Error('terminating connection due to administrator command'),
      { code: '57P01' }
    );

    // Rethrowing here is precisely what reached process.on('uncaughtException')
    // and shut the app down.
    expect(() => handler!(pgRestart)).not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Idle database client error'),
      expect.objectContaining({ code: '57P01' })
    );
  });
});
