import { Pool } from 'pg';
import { ensureAdminExists } from './adminBootstrapService';
import { User } from '@/models/User';
import logger from '@/services/loggerService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('adminBootstrapService.ensureAdminExists', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: Pool;
  let hashPasswordSpy: jest.SpyInstance;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    hashPasswordSpy = jest.spyOn(User, 'hashPassword').mockResolvedValue('hashed-pw');

    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_EMAIL;
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_EMAIL;
  });

  it('creates the admin user when none exists (generated password)', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // admin count
      .mockResolvedValueOnce({ rows: [] }) // existing user by email - none
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    await ensureAdminExists(mockPool);

    const insertCall = mockClient.query.mock.calls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO users')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toEqual(expect.stringContaining('must_change_password'));
    expect(insertCall![1]).toEqual(['admin@ezsign.local', 'hashed-pw']);

    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('super admin user created'),
      expect.objectContaining({ email: 'admin@ezsign.local' })
    );
  });

  it('is a no-op when an admin already exists', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // admin count > 0
      .mockResolvedValueOnce(undefined); // COMMIT

    await ensureAdminExists(mockPool);

    const insertCall = mockClient.query.mock.calls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO users')
    );
    expect(insertCall).toBeUndefined();
    expect(hashPasswordSpy).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('refuses (without throwing) when the target email is taken by a non-admin', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // admin count
      .mockResolvedValueOnce({ rows: [{ role: 'creator' }] }) // existing user - non-admin
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(ensureAdminExists(mockPool)).resolves.toBeUndefined();

    const insertCall = mockClient.query.mock.calls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO users')
    );
    expect(insertCall).toBeUndefined();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('cannot bootstrap admin')
    );
  });

  it('tolerates an undefined-table error (42P01) by logging a warning and not throwing', async () => {
    const schemaError = Object.assign(new Error('relation "users" does not exist'), {
      code: '42P01',
    });

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockRejectedValueOnce(schemaError) // admin count query fails
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(ensureAdminExists(mockPool)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('run npm run migrate')
    );
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('uses ADMIN_PASSWORD when set and prints nothing to the console', async () => {
    process.env.ADMIN_PASSWORD = 'MySuppliedPassword123!';

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // admin count
      .mockResolvedValueOnce({ rows: [] }) // existing user - none
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    await ensureAdminExists(mockPool);

    expect(hashPasswordSpy).toHaveBeenCalledWith('MySuppliedPassword123!');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('generates a password and prints it to stdout via console.log when ADMIN_PASSWORD is not set', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // admin count
      .mockResolvedValueOnce({ rows: [] }) // existing user - none
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    await ensureAdminExists(mockPool);

    expect(hashPasswordSpy).toHaveBeenCalledTimes(1);
    const generatedPassword = hashPasswordSpy.mock.calls[0]?.[0] as string;
    expect(typeof generatedPassword).toBe('string');
    expect(generatedPassword.length).toBe(20);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(generatedPassword)
    );
  });

  it('never passes the plaintext password to the winston logger', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // admin count
      .mockResolvedValueOnce({ rows: [] }) // existing user - none
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    await ensureAdminExists(mockPool);

    const generatedPassword = hashPasswordSpy.mock.calls[0]?.[0] as string;
    expect(generatedPassword).toBeTruthy();

    const allLoggerCalls = [
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls,
      ...(logger.debug as jest.Mock).mock.calls,
    ];

    for (const call of allLoggerCalls) {
      for (const arg of call) {
        const serialized = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(serialized).not.toContain(generatedPassword);
      }
    }
  });
});
