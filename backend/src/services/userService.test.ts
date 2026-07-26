import { Pool } from 'pg';
import { UserService } from './userService';

/**
 * A minimal row shape satisfying `UserData` for the columns `findByEmail`
 * actually selects and the `User` constructor reads.
 */
function makeUserRow(overrides: Partial<{ id: string; email: string; created_at: Date }>) {
  return {
    id: overrides.id ?? 'user-id',
    email: overrides.email ?? 'user@example.com',
    password_hash: 'hash',
    role: 'creator' as const,
    email_verified: false,
    email_verification_token: null,
    email_verification_expires: null,
    password_reset_token: null,
    password_reset_expires: null,
    must_change_password: false,
    created_at: overrides.created_at ?? new Date('2026-01-01T00:00:00Z'),
    updated_at: overrides.created_at ?? new Date('2026-01-01T00:00:00Z'),
  };
}

/**
 * A hand-written fake `pool.query` that actually *executes* the semantics
 * `findByEmail`'s SQL text asks for (case-insensitive match, ORDER BY
 * created_at, LIMIT n) against an in-memory row set, instead of returning a
 * canned answer regardless of input.
 *
 * Why this exists: there is no reachable Postgres instance in this
 * environment (confirmed - `localhost:5432` refuses the connection), so a
 * plain `mockResolvedValueOnce` can only prove the JS-level plumbing, not
 * that the *matching itself* is case-insensitive or that ordering/limiting
 * actually narrows a multi-row match deterministically. This fake closes
 * that gap for the one predicate the diff changed:
 *
 *  - The `LOWER(email) = LOWER($1)` check is asserted strictly (throws if
 *    absent) - a revert to plain `email = $1` must fail loudly here, not
 *    silently return a differently-wrong-but-still-passing result.
 *  - `ORDER BY`/`LIMIT` are applied only if present in the SQL text (kept
 *    lenient, not strict-throw) precisely so that reverting *those* clauses
 *    produces a wrong-but-comparable row (the later-created one, since the
 *    two seed rows below are given to the fake in later-created-first
 *    order) rather than an opaque thrown error - a meaningful assertion
 *    failure instead of a crash.
 *
 * This does NOT prove Postgres's own `LOWER()`/collation behavior - only
 * that `findByEmail`'s query text carries the right predicate and that the
 * JS layer forwards the param unmodified and maps rows correctly assuming
 * the DB executes that predicate as documented. See the test-pass report
 * for this distinction spelled out again.
 */
function makeCaseInsensitiveUsersPool(rows: ReturnType<typeof makeUserRow>[]) {
  const query = jest.fn((sql: string, params: unknown[]) => {
    if (!/FROM users/i.test(sql)) {
      throw new Error(`Unexpected query against fake users pool: ${sql}`);
    }
    if (!/LOWER\(email\)\s*=\s*LOWER\(\$1\)/i.test(sql)) {
      throw new Error(
        `findByEmail's query no longer matches case-insensitively (expected LOWER(email) = LOWER($1)): ${sql}`
      );
    }

    const target = String(params[0]).toLowerCase();
    let matches = rows.filter((r) => r.email.toLowerCase() === target);

    if (/ORDER BY created_at/i.test(sql)) {
      matches = [...matches].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    }
    const limitMatch = /LIMIT (\d+)/i.exec(sql);
    if (limitMatch) {
      matches = matches.slice(0, Number(limitMatch[1]));
    }

    return Promise.resolve({ rows: matches });
  });

  return { query };
}

describe('UserService.findByEmail', () => {
  it('builds a case-insensitive, deterministically-ordered, single-row query', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new UserService(mockPool as unknown as Pool);

    await service.findByEmail('someone@example.com');

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toEqual(expect.stringContaining('LOWER(email) = LOWER($1)'));
    expect(sql).toEqual(expect.stringContaining('ORDER BY created_at'));
    expect(sql).toEqual(expect.stringContaining('LIMIT 1'));
    // The JS layer does not itself lowercase - it lets the DB predicate
    // handle case, so the caller's exact casing is forwarded unmodified.
    expect(params).toEqual(['someone@example.com']);
  });

  it('finds a mixed-case stored row when queried with an all-lowercase email', async () => {
    const storedRow = makeUserRow({ email: 'Foo@Bar.com', id: 'user-1' });
    const pool = makeCaseInsensitiveUsersPool([storedRow]);
    const service = new UserService(pool as unknown as Pool);

    const user = await service.findByEmail('foo@bar.com');

    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-1');
    expect(user!.email).toBe('Foo@Bar.com');
  });

  it('finds an all-lowercase stored row when queried with a mixed/upper-case email', async () => {
    const storedRow = makeUserRow({ email: 'foo@bar.com', id: 'user-2' });
    const pool = makeCaseInsensitiveUsersPool([storedRow]);
    const service = new UserService(pool as unknown as Pool);

    const user = await service.findByEmail('FOO@Bar.COM');

    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-2');
  });

  it('returns null when no row matches regardless of case', async () => {
    const pool = makeCaseInsensitiveUsersPool([makeUserRow({ email: 'someone-else@example.com' })]);
    const service = new UserService(pool as unknown as Pool);

    const user = await service.findByEmail('nobody@example.com');

    expect(user).toBeNull();
  });

  it('is deterministic when two rows differ only by case: always returns the earlier-created row (ORDER BY created_at LIMIT 1)', async () => {
    // Deliberately fed later-created-first, so that a regression which
    // dropped ORDER BY/LIMIT (and thus fell back to "first array element")
    // would return the *later* row here - a wrong-but-visible result,
    // rather than happening to still pass.
    const laterRow = makeUserRow({
      email: 'Foo.Unique@Example.com',
      id: 'later-account',
      created_at: new Date('2026-02-01T00:00:00Z'),
    });
    const earlierRow = makeUserRow({
      email: 'foo.unique@example.com',
      id: 'earlier-account',
      created_at: new Date('2026-01-01T00:00:00Z'),
    });
    const pool = makeCaseInsensitiveUsersPool([laterRow, earlierRow]);
    const service = new UserService(pool as unknown as Pool);

    // Repeated calls must all agree on the same (earlier) row.
    for (let i = 0; i < 3; i++) {
      const user = await service.findByEmail('foo.unique@example.com');
      expect(user!.id).toBe('earlier-account');
    }
  });
});

describe('UserService.listAccountsForAudit', () => {
  let mockPool: { query: jest.Mock };
  let service: UserService;

  beforeEach(() => {
    mockPool = { query: jest.fn() };
    service = new UserService(mockPool as unknown as Pool);
  });

  it('queries all accounts (including admins) ordered by created_at, returning only id/email/role/created_at', async () => {
    const rows = [
      { id: '1', email: 'a@example.com', role: 'creator', created_at: new Date('2026-01-01') },
      { id: '2', email: 'b@example.com', role: 'signer', created_at: new Date('2026-01-02') },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count query
      .mockResolvedValueOnce({ rows }); // data query

    const result = await service.listAccountsForAudit({ limit: 20, offset: 0 });

    expect(result).toEqual({ accounts: rows, total: 2 });

    const dataQueryCall = mockPool.query.mock.calls[1];
    expect(dataQueryCall[0]).toEqual(expect.stringContaining('ORDER BY created_at'));
    // No role filter - a promoted-to-admin account created during an open
    // registration window must stay visible to this audit.
    expect(dataQueryCall[0]).not.toEqual(expect.stringContaining("role !="));
    // Never selects password_hash or any 2FA-related column.
    expect(dataQueryCall[0]).toEqual(expect.not.stringContaining('password_hash'));
    expect(dataQueryCall[0]).toEqual(expect.not.stringContaining('two_fa_failed_attempts'));
    expect(dataQueryCall[0]).toEqual(expect.not.stringContaining('two_fa_locked_until'));
    expect(dataQueryCall[1]).toEqual([20, 0]);
  });

  it('returns an empty page when there are no accounts', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.listAccountsForAudit({ limit: 20, offset: 0 });

    expect(result).toEqual({ accounts: [], total: 0 });
  });

  it('passes limit/offset through to the data query for pagination', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    await service.listAccountsForAudit({ limit: 10, offset: 20 });

    expect(mockPool.query.mock.calls[1][1]).toEqual([10, 20]);
  });
});
