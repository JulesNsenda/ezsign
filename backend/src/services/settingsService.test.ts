import { Pool, PoolClient } from 'pg';
import { SettingsService, SettingsValidationError, SETTINGS_REGISTRY } from './settingsService';
import { decryptSecret } from '@/utils/secretsCrypto';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const ENV_KEYS = [
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_SECURE',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASS',
  'EMAIL_FROM',
  'EMAIL_FROM_ADDRESS',
  'EMAIL_SMTP_FROM',
  'APP_URL',
  'BASE_URL',
];

describe('SettingsService', () => {
  let mockPool: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let service: SettingsService;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {};
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient as unknown as PoolClient),
    };
    service = new SettingsService(mockPool as unknown as Pool);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe('getValue: DB -> env -> default resolution', () => {
    it('returns the default when neither a DB row nor an env var is present', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const value = await service.getValue('smtp.host');
      expect(value).toBe('localhost');
    });

    it('falls back to the env var when no DB row exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      process.env.EMAIL_SMTP_HOST = 'smtp.env.example.com';
      const value = await service.getValue('smtp.host');
      expect(value).toBe('smtp.env.example.com');
    });

    it('prefers a DB row over the env var', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: 'smtp.db.example.com', is_secret: false }],
      });
      process.env.EMAIL_SMTP_HOST = 'smtp.env.example.com';
      const value = await service.getValue('smtp.host');
      expect(value).toBe('smtp.db.example.com');
    });

    it('coerces numeric settings from storage', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ value: '2525', is_secret: false }] });
      const value = await service.getValue('smtp.port');
      expect(value).toBe(2525);
      expect(typeof value).toBe('number');
    });

    describe('email.from 3-name env fallback chain', () => {
      it('uses EMAIL_SMTP_FROM when it is the only one set', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        process.env.EMAIL_SMTP_FROM = 'legacy@example.com';
        const value = await service.getValue('email.from');
        expect(value).toBe('legacy@example.com');
      });

      it('prefers EMAIL_FROM_ADDRESS over EMAIL_SMTP_FROM', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        process.env.EMAIL_SMTP_FROM = 'legacy@example.com';
        process.env.EMAIL_FROM_ADDRESS = 'address@example.com';
        const value = await service.getValue('email.from');
        expect(value).toBe('address@example.com');
      });

      it('prefers EMAIL_FROM over both other names', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        process.env.EMAIL_SMTP_FROM = 'legacy@example.com';
        process.env.EMAIL_FROM_ADDRESS = 'address@example.com';
        process.env.EMAIL_FROM = 'primary@example.com';
        const value = await service.getValue('email.from');
        expect(value).toBe('primary@example.com');
      });

      it('falls back to the default when none of the three are set', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        const value = await service.getValue('email.from');
        expect(value).toBe('noreply@ezsign.local');
      });
    });

    it('throws SettingsValidationError for an unknown key', async () => {
      await expect(service.getValue('not.a.real.key')).rejects.toThrow(SettingsValidationError);
    });
  });

  describe('registration.enabled: DB -> default only, no env fallback', () => {
    it('defaults to false when no DB row exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const value = await service.getValue('registration.enabled');
      expect(value).toBe(false);
    });

    it('prefers a DB row over any env var', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ value: 'true', is_secret: false }] });
      const value = await service.getValue('registration.enabled');
      expect(value).toBe(true);
    });

    it('set(null) deletes the DB row and reverts to the registry default (false), since there is no env fallback to fall through to first', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      await service.set([{ key: 'registration.enabled', value: null }], 'user-1');

      const deleteCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('DELETE FROM instance_settings') &&
          call[1]?.[0] === 'registration.enabled'
      );
      expect(deleteCall).toBeDefined();

      // getValue re-resolves DB -> env -> default; the DB row was just
      // deleted, and (per the sibling test below) this key has no
      // envFallback entries at all, so the only place left to land is the
      // registry default.
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const value = await service.getValue('registration.enabled');
      expect(value).toBe(false);
    });

    it('has no envFallback entries in the registry (asserted directly, not just behaviorally) - no env var, real or invented, can reopen registration', () => {
      expect(SETTINGS_REGISTRY['registration.enabled']?.envFallback).toBeUndefined();
    });
  });

  describe('boolean coercion from storage/env (accepts common truthy/falsy spellings)', () => {
    it.each(['1', 'true', 'TRUE', ' Yes ', 'on', 'ON'])(
      'coerces stored value "%s" to true',
      async (raw) => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ value: raw, is_secret: false }] });
        const value = await service.getValue('smtp.secure');
        expect(value).toBe(true);
      }
    );

    // Note on regression coverage: unlike the truthy block above, no input
    // here can distinguish this coercion from the old buggy `raw === 'true'`
    // check - every one of these spellings is already not `'true'`, so the
    // old code returned `false` for all of them too. This block is a
    // positive behavior spec (these six spellings must decode to `false`),
    // not a regression test; ' No ' with padding is the one case that would
    // catch a *different* plausible regression (dropping the
    // `.trim().toLowerCase()` normalization). Actual regression detection
    // against the historical bug lives in the truthy block and the
    // "throws...unrecognized" test below.
    it.each(['0', 'false', 'FALSE', ' No ', 'off', 'OFF'])(
      'coerces stored value "%s" to false',
      async (raw) => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ value: raw, is_secret: false }] });
        const value = await service.getValue('smtp.secure');
        expect(value).toBe(false);
      }
    );

    it('throws rather than silently defaulting to false for an unrecognized stored value', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ value: 'maybe', is_secret: false }] });
      await expect(service.getValue('smtp.secure')).rejects.toThrow(SettingsValidationError);
    });

    it('coerces a truthy env var (fixes the old raw === "true" bug where "1"/"TRUE" silently became false)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      process.env.EMAIL_SMTP_SECURE = '1';
      const value = await service.getValue('smtp.secure');
      expect(value).toBe(true);
    });

    it('getValue() falls through to the default (does not throw) for an unrecognized env value - an operator typo must not hard-fail mail sending', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      process.env.EMAIL_SMTP_SECURE = 'ssl';
      const value = await service.getValue('smtp.secure');
      expect(value).toBe(false); // registry default for smtp.secure
    });

    it('getEmailConfig() falls through to the default for an unrecognized env value instead of throwing', async () => {
      process.env.EMAIL_SMTP_SECURE = 'ssl';
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const config = await service.getEmailConfig();

      expect(config.secure).toBe(false);
    });

    it('getAll() never throws on an unrecognized stored boolean, but reports it as invalid (not default) so it stays distinguishable from "unconfigured"', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ key: 'smtp.secure', value: 'maybe', is_secret: false }],
      });

      const all = await service.getAll();
      const smtpSecure = all.find((s) => s.key === 'smtp.secure');

      expect(smtpSecure).toMatchObject({ value: false, source: 'invalid', isSet: true });
    });

    it('getAll() reports an invalid env-sourced boolean the same way (invalid, not default)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      process.env.EMAIL_SMTP_SECURE = 'ssl';

      const all = await service.getAll();
      const smtpSecure = all.find((s) => s.key === 'smtp.secure');

      expect(smtpSecure).toMatchObject({ value: false, source: 'invalid', isSet: true });
    });
  });

  describe('getAll', () => {
    it('masks secret values (null) and reports isSet + source for a DB-stored secret', async () => {
      const { encryptSecret } = jest.requireActual('@/utils/secretsCrypto');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ key: 'smtp.pass', value: encryptSecret('hunter2'), is_secret: true }],
      });

      const all = await service.getAll();
      const smtpPass = all.find((s) => s.key === 'smtp.pass');

      expect(smtpPass).toMatchObject({ value: null, isSet: true, source: 'db', isSecret: true });
    });

    it('reports env-sourced non-secret settings with their value and source', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      process.env.EMAIL_SMTP_HOST = 'smtp.env.example.com';

      const all = await service.getAll();
      const smtpHost = all.find((s) => s.key === 'smtp.host');

      expect(smtpHost).toMatchObject({
        value: 'smtp.env.example.com',
        isSet: true,
        source: 'env',
        isSecret: false,
      });
    });

    it('reports default-sourced settings when nothing else is configured', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const all = await service.getAll();
      const appUrl = all.find((s) => s.key === 'app.url');

      expect(appUrl).toMatchObject({
        value: 'http://localhost:3002',
        isSet: true,
        source: 'default',
      });
    });

    it('never leaks a secret value even when the value came from the default', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const all = await service.getAll();
      const smtpPass = all.find((s) => s.key === 'smtp.pass');

      expect(smtpPass?.value).toBeNull();
      expect(smtpPass?.source).toBe('default');
      // Default is '' so nothing usable is configured.
      expect(smtpPass?.isSet).toBe(false);
    });

    it('reports isSet: false (without throwing) for a corrupted/undecryptable secret row', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ key: 'smtp.pass', value: 'not-a-valid-encrypted-value', is_secret: true }],
      });

      const all = await service.getAll();
      const smtpPass = all.find((s) => s.key === 'smtp.pass');

      expect(smtpPass).toMatchObject({ value: null, isSet: false, source: 'db' });
    });

    it('queries all known keys in a single batched call', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.getAll();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('key = ANY($1::text[])'),
        [expect.arrayContaining(['smtp.host', 'smtp.pass', 'email.from', 'app.url'])]
      );
    });
  });

  describe('set: validation', () => {
    it('rejects an unknown key without touching the database', async () => {
      await expect(
        service.set([{ key: 'not.a.real.key', value: 'x' }], 'user-1')
      ).rejects.toThrow(SettingsValidationError);
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rejects a duplicate key in the same request', async () => {
      await expect(
        service.set(
          [
            { key: 'smtp.host', value: 'a' },
            { key: 'smtp.host', value: 'b' },
          ],
          'user-1'
        )
      ).rejects.toThrow(SettingsValidationError);
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    describe('app.url scheme validation', () => {
      it('rejects http:// for a non-localhost hostname', async () => {
        await expect(
          service.set([{ key: 'app.url', value: 'http://example.com' }], 'user-1')
        ).rejects.toThrow(SettingsValidationError);
        expect(mockPool.connect).not.toHaveBeenCalled();
      });

      it('accepts http:// for localhost', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        await service.set([{ key: 'app.url', value: 'http://localhost:3002' }], 'user-1');

        const upsertCall = mockClient.query.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('ON CONFLICT (key) DO UPDATE')
        );
        expect(upsertCall).toBeDefined();
        expect(upsertCall![1][0]).toBe('app.url');
        expect(upsertCall![1][1]).toBe('http://localhost:3002');
      });

      it('strips a trailing slash from a valid https URL', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        await service.set([{ key: 'app.url', value: 'https://ezsign.example.com/' }], 'user-1');

        const upsertCall = mockClient.query.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('ON CONFLICT (key) DO UPDATE')
        );
        expect(upsertCall![1][1]).toBe('https://ezsign.example.com');
      });
    });
  });

  describe('set: smtp.pass tombstone on transport change', () => {
    it('writes an encrypted-empty tombstone (upsert, not delete) when host changes without an explicit pass', async () => {
      // currentEffective check for smtp.host, via pool.query (pre-transaction)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: 'old-host.example.com', is_secret: false }],
      });
      mockClient.query.mockResolvedValue({ rows: [] });

      await service.set([{ key: 'smtp.host', value: 'new-host.example.com' }], 'user-1');

      const passUpsertCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('ON CONFLICT (key) DO UPDATE') &&
          call[1][0] === 'smtp.pass'
      );
      expect(passUpsertCall).toBeDefined();

      // Never a DELETE for smtp.pass in this scenario.
      const passDeleteCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('DELETE FROM instance_settings') &&
          call[1]?.[0] === 'smtp.pass'
      );
      expect(passDeleteCall).toBeUndefined();
    });

    it(
      'the tombstoned smtp.pass value actually decrypts back to an empty string',
      async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ value: 'old-host.example.com', is_secret: false }],
        });
        mockClient.query.mockResolvedValue({ rows: [] });

        await service.set([{ key: 'smtp.host', value: 'new-host.example.com' }], 'user-1');

        const passUpsertCall = mockClient.query.mock.calls.find(
          (call) =>
            typeof call[0] === 'string' &&
            call[0].includes('ON CONFLICT (key) DO UPDATE') &&
            call[1][0] === 'smtp.pass'
        );
        const storedPassValue = passUpsertCall![1][1];
        expect(decryptSecret(storedPassValue)).toBe('');
      }
    );

    it('does not tombstone smtp.pass when the transport key value is unchanged', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: 'same-host.example.com', is_secret: false }],
      });
      mockClient.query.mockResolvedValue({ rows: [] });

      await service.set([{ key: 'smtp.host', value: 'same-host.example.com' }], 'user-1');

      const passCall = mockClient.query.mock.calls.find(
        (call) => call[1]?.[0] === 'smtp.pass'
      );
      expect(passCall).toBeUndefined();
    });

    it('treats a corrupt current stored value as changed rather than throwing - a PUT that fixes the corrupt key itself must still succeed (tombstones smtp.pass to be safe)', async () => {
      // The currently-stored smtp.secure value is corrupt/unparseable -
      // this is exactly the case getAll() now reports as `source: 'invalid'`.
      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: 'maybe', is_secret: false }],
      });
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(
        service.set([{ key: 'smtp.secure', value: false }], 'user-1')
      ).resolves.toBeUndefined();

      const passUpsertCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('ON CONFLICT (key) DO UPDATE') &&
          call[1][0] === 'smtp.pass'
      );
      expect(passUpsertCall).toBeDefined();
    });

    it('skips the auto-tombstone when smtp.pass is explicitly set in the same request', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await service.set(
        [
          { key: 'smtp.host', value: 'new-host.example.com' },
          { key: 'smtp.pass', value: 'brand-new-password' },
        ],
        'user-1'
      );

      // No pre-transaction currentEffective check should be needed since
      // passExplicitlyTouched short-circuits the auto-clear branch.
      expect(mockPool.query).not.toHaveBeenCalled();

      const passUpsertCalls = mockClient.query.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('ON CONFLICT (key) DO UPDATE') &&
          call[1][0] === 'smtp.pass'
      );
      expect(passUpsertCalls).toHaveLength(1);
      expect(decryptSecret(passUpsertCalls[0]![1][1])).toBe('brand-new-password');
    });
  });

  describe('set: audit trail', () => {
    it('inserts a settings.updated audit event in the same transaction, with keys-only metadata', async () => {
      // Non-transport key (email.from) so no pre-transaction currentEffective
      // check against mockPool.query is needed.
      mockClient.query.mockResolvedValue({ rows: [] });

      await service.set([{ key: 'email.from', value: 'notifications@example.com' }], 'user-42', '203.0.113.5');

      const auditCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO audit_events')
      );
      expect(auditCall).toBeDefined();
      expect(auditCall![0]).toEqual(expect.stringContaining("'settings.updated'"));
      const [updatedBy, sourceIp, metadataJson] = auditCall![1];
      expect(updatedBy).toBe('user-42');
      expect(sourceIp).toBe('203.0.113.5');
      const metadata = JSON.parse(metadataJson);
      expect(metadata).toEqual({ keys: ['email.from'] });

      // BEGIN/COMMIT bracket the transaction.
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('never includes secret values in the audit metadata', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await service.set([{ key: 'smtp.pass', value: 'top-secret-value' }], 'user-42');

      const auditCall = mockClient.query.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO audit_events')
      );
      const metadataJson = auditCall![1][2];
      expect(metadataJson).not.toContain('top-secret-value');
      expect(JSON.parse(metadataJson)).toEqual({ keys: ['smtp.pass'] });
    });
  });

  describe('getEmailConfig', () => {
    it('omits auth when the resolved password is empty', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { key: 'smtp.host', value: 'smtp.example.com', is_secret: false },
            { key: 'smtp.user', value: 'someuser', is_secret: false },
          ],
        }) // batched smtp/from query
        .mockResolvedValueOnce({ rows: [] }); // app.url query

      const config = await service.getEmailConfig();

      expect(config.auth).toBeUndefined();
      expect(config.host).toBe('smtp.example.com');
    });

    it('includes auth when both user and pass are non-empty', async () => {
      const { encryptSecret } = jest.requireActual('@/utils/secretsCrypto');
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { key: 'smtp.user', value: 'someuser', is_secret: false },
            { key: 'smtp.pass', value: encryptSecret('somepass'), is_secret: true },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const config = await service.getEmailConfig();

      expect(config.auth).toEqual({ user: 'someuser', pass: 'somepass' });
    });

    it('batches the six smtp/from keys into a single ANY() query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.getEmailConfig();

      const batchedCall = mockPool.query.mock.calls[0];
      expect(batchedCall![0]).toEqual(expect.stringContaining('key = ANY($1::text[])'));
      expect(batchedCall![1][0]).toEqual(
        expect.arrayContaining(['smtp.host', 'smtp.port', 'smtp.secure', 'smtp.user', 'smtp.pass', 'email.from'])
      );
      expect(batchedCall![1][0]).not.toContain('app.url');
    });
  });
});
