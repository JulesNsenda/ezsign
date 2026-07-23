/**
 * Jest stand-in for the ESM-only `pg-boss` package (mapped via
 * moduleNameMapper). ts-jest cannot parse pg-boss's ESM build, and most
 * suites only import it transitively through `@/config/queue`. Tests that
 * exercise queue behavior directly (config/queue.test.ts etc.) override this
 * with an explicit `jest.mock('pg-boss', ...)` factory, which takes
 * precedence over this mapping.
 */
export class PgBoss {
  start = jest.fn().mockResolvedValue(this);
  stop = jest.fn().mockResolvedValue(undefined);
  createQueue = jest.fn().mockResolvedValue(undefined);
  updateQueue = jest.fn().mockResolvedValue(undefined);
  getQueue = jest.fn().mockResolvedValue(null);
  send = jest.fn().mockResolvedValue('00000000-0000-0000-0000-000000000000');
  work = jest.fn().mockResolvedValue('stub-worker-id');
  schedule = jest.fn().mockResolvedValue(undefined);
  unschedule = jest.fn().mockResolvedValue(undefined);
  getSchedules = jest.fn().mockResolvedValue([]);
  cancel = jest.fn().mockResolvedValue(undefined);
  findJobs = jest.fn().mockResolvedValue([]);
  getQueueStats = jest.fn().mockResolvedValue([]);
}

export default PgBoss;
