import { Pool } from 'pg';
import { tokenBlacklistService } from './tokenBlacklistService';

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

/**
 * IMPORTANT: tokenBlacklistService is a module-level singleton, and its
 * "uninitialized" state only exists before the first init() call in this
 * process. These tests therefore run the "before init()" assertions first,
 * then init() the shared instance for every subsequent describe block.
 */
describe('TokenBlacklistService', () => {
  describe('before init()', () => {
    it('blacklistToken throws a clear error', async () => {
      await expect(tokenBlacklistService.blacklistToken('jti-1', 60)).rejects.toThrow(
        /used before init\(pool\)/
      );
    });

    it('isBlacklisted throws a clear error (fails closed by rejecting the call)', async () => {
      await expect(tokenBlacklistService.isBlacklisted('jti-1')).rejects.toThrow(
        /used before init\(pool\)/
      );
    });

    it('blacklistAllUserTokens throws a clear error', async () => {
      await expect(tokenBlacklistService.blacklistAllUserTokens('user-1')).rejects.toThrow(
        /used before init\(pool\)/
      );
    });

    it('isUserSessionRevoked throws a clear error', async () => {
      await expect(tokenBlacklistService.isUserSessionRevoked('user-1', 1000)).rejects.toThrow(
        /used before init\(pool\)/
      );
    });
  });

  describe('after init()', () => {
    let mockPool: { query: jest.Mock };
    let randomSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      tokenBlacklistService.init(mockPool as unknown as Pool);
      // Keep the opportunistic cleanup sweep (~1% of writes) off by default
      // so assertions about "what SQL did this call issue" stay precise.
      // Cleanup itself gets its own dedicated test below.
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.999);
    });

    afterEach(() => {
      randomSpy.mockRestore();
    });

    describe('blacklistToken', () => {
      it('inserts into revoked_tokens with an expiry computed from the TTL', async () => {
        await tokenBlacklistService.blacklistToken('jti-1', 120);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO revoked_tokens'),
          ['jti-1', 120]
        );
        expect(mockPool.query.mock.calls[0][0]).toEqual(expect.stringContaining('ON CONFLICT'));
      });

      it('clamps a non-positive TTL to 1 second', async () => {
        await tokenBlacklistService.blacklistToken('jti-1', -5);

        expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['jti-1', 1]);
      });

      it('is best-effort: a query error is logged and swallowed, not thrown', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('connection refused'));

        await expect(tokenBlacklistService.blacklistToken('jti-1', 60)).resolves.toBeUndefined();
      });
    });

    describe('isBlacklisted', () => {
      it('returns true when the row exists and has not expired', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ revoked: true }] });

        await expect(tokenBlacklistService.isBlacklisted('jti-1')).resolves.toBe(true);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('FROM revoked_tokens'),
          ['jti-1']
        );
      });

      it('returns false when no matching, non-expired row exists', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ revoked: false }] });

        await expect(tokenBlacklistService.isBlacklisted('jti-1')).resolves.toBe(false);
      });

      it('fails closed (returns true) on a query error', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('connection refused'));

        await expect(tokenBlacklistService.isBlacklisted('jti-1')).resolves.toBe(true);
      });
    });

    describe('blacklistAllUserTokens', () => {
      it('upserts user_token_revocations with revoked_at = now() and the given TTL', async () => {
        await tokenBlacklistService.blacklistAllUserTokens('user-1', 3600);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_token_revocations'),
          ['user-1', 3600]
        );
        expect(mockPool.query.mock.calls[0][0]).toEqual(
          expect.stringContaining('ON CONFLICT (user_id) DO UPDATE')
        );
      });

      it('resolves true on a successful write', async () => {
        await expect(
          tokenBlacklistService.blacklistAllUserTokens('user-1', 3600)
        ).resolves.toBe(true);
      });

      it('defaults the TTL to 7 days (604800s) when JWT_REFRESH_TOKEN_EXPIRY is unset, mirroring the refresh token lifetime', async () => {
        delete process.env.JWT_REFRESH_TOKEN_EXPIRY;

        await tokenBlacklistService.blacklistAllUserTokens('user-1');

        expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 7 * 24 * 60 * 60]);
      });

      it('is best-effort: a query error is logged and swallowed, not thrown - resolves false so a caller that checks can tell', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('connection refused'));

        await expect(
          tokenBlacklistService.blacklistAllUserTokens('user-1')
        ).resolves.toBe(false);
      });

      describe('TTL derived from JWT_REFRESH_TOKEN_EXPIRY (Gate 2 fix 3)', () => {
        const originalExpiry = process.env.JWT_REFRESH_TOKEN_EXPIRY;

        afterEach(() => {
          if (originalExpiry === undefined) {
            delete process.env.JWT_REFRESH_TOKEN_EXPIRY;
          } else {
            process.env.JWT_REFRESH_TOKEN_EXPIRY = originalExpiry;
          }
        });

        it("parses '12h' into 43200 seconds", async () => {
          process.env.JWT_REFRESH_TOKEN_EXPIRY = '12h';

          await tokenBlacklistService.blacklistAllUserTokens('user-1');

          expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 43200]);
        });

        it("parses '15m' into 900 seconds", async () => {
          process.env.JWT_REFRESH_TOKEN_EXPIRY = '15m';

          await tokenBlacklistService.blacklistAllUserTokens('user-1');

          expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 900]);
        });

        it("parses a bare number of seconds ('3600')", async () => {
          process.env.JWT_REFRESH_TOKEN_EXPIRY = '3600';

          await tokenBlacklistService.blacklistAllUserTokens('user-1');

          expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 3600]);
        });

        it('falls back to 604800 (7d) and logs a warning on an unparseable value', async () => {
          process.env.JWT_REFRESH_TOKEN_EXPIRY = 'not-a-duration';

          await tokenBlacklistService.blacklistAllUserTokens('user-1');

          expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
            'user-1',
            7 * 24 * 60 * 60,
          ]);
          expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Unparseable JWT_REFRESH_TOKEN_EXPIRY'),
            expect.objectContaining({ value: 'not-a-duration' })
          );
        });

        it('an explicit maxTokenLifetimeSeconds argument overrides the env-derived default', async () => {
          process.env.JWT_REFRESH_TOKEN_EXPIRY = '12h';

          await tokenBlacklistService.blacklistAllUserTokens('user-1', 60);

          expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 60]);
        });
      });
    });

    describe('isUserSessionRevoked', () => {
      it('returns false when the user has no revocation row', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        await expect(tokenBlacklistService.isUserSessionRevoked('user-1', 1000)).resolves.toBe(
          false
        );
      });

      it('is an inclusive boundary: a token issued in the same second as the revocation is revoked', async () => {
        const revokedAtSeconds = 1_700_000_000;
        mockPool.query.mockResolvedValueOnce({
          rows: [{ revoked_at: new Date(revokedAtSeconds * 1000) }],
        });

        await expect(
          tokenBlacklistService.isUserSessionRevoked('user-1', revokedAtSeconds)
        ).resolves.toBe(true);
      });

      it('treats a token issued one second before the revocation as revoked', async () => {
        const revokedAtSeconds = 1_700_000_000;
        mockPool.query.mockResolvedValueOnce({
          rows: [{ revoked_at: new Date(revokedAtSeconds * 1000) }],
        });

        await expect(
          tokenBlacklistService.isUserSessionRevoked('user-1', revokedAtSeconds - 1)
        ).resolves.toBe(true);
      });

      it('treats a token issued one second after the revocation as NOT revoked', async () => {
        const revokedAtSeconds = 1_700_000_000;
        mockPool.query.mockResolvedValueOnce({
          rows: [{ revoked_at: new Date(revokedAtSeconds * 1000) }],
        });

        await expect(
          tokenBlacklistService.isUserSessionRevoked('user-1', revokedAtSeconds + 1)
        ).resolves.toBe(false);
      });

      it('does not mis-truncate sub-second precision on revoked_at', async () => {
        const revokedAtSeconds = 1_700_000_000;
        // 500ms into the *next* second -- flooring must not round this down
        // into the previous second's boundary.
        mockPool.query.mockResolvedValueOnce({
          rows: [{ revoked_at: new Date(revokedAtSeconds * 1000 + 500) }],
        });

        // A token issued exactly at revokedAtSeconds should still be
        // considered issued before/at the (floored) revocation second.
        await expect(
          tokenBlacklistService.isUserSessionRevoked('user-1', revokedAtSeconds)
        ).resolves.toBe(true);
        // A token issued one second later must NOT be caught by the
        // fractional millisecond overhang.
        await expect(
          tokenBlacklistService.isUserSessionRevoked('user-1', revokedAtSeconds + 1)
        ).resolves.toBe(false);
      });

      it('fails closed (returns true) on a query error', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('connection refused'));

        await expect(tokenBlacklistService.isUserSessionRevoked('user-1', 1000)).resolves.toBe(
          true
        );
      });
    });

    describe('opportunistic cleanup', () => {
      it('sweeps expired rows from both tables on ~1% of writes', async () => {
        randomSpy.mockReturnValue(0); // always below the 1% threshold

        await tokenBlacklistService.blacklistToken('jti-1', 60);

        // Insert + two cleanup deletes.
        expect(mockPool.query).toHaveBeenCalledTimes(3);
        const sqlCalls = mockPool.query.mock.calls.map((call) => call[0]);
        expect(sqlCalls).toEqual(
          expect.arrayContaining([
            expect.stringContaining('DELETE FROM revoked_tokens'),
            expect.stringContaining('DELETE FROM user_token_revocations'),
          ])
        );
      });

      it('does not sweep when above the cleanup probability threshold', async () => {
        randomSpy.mockReturnValue(0.999);

        await tokenBlacklistService.blacklistToken('jti-1', 60);

        expect(mockPool.query).toHaveBeenCalledTimes(1);
      });

      it('cleanup failures are logged and never surface to the write caller', async () => {
        randomSpy.mockReturnValue(0);
        mockPool.query
          .mockResolvedValueOnce({ rows: [] }) // the blacklistToken insert
          .mockRejectedValueOnce(new Error('cleanup failed')); // first cleanup DELETE

        await expect(tokenBlacklistService.blacklistToken('jti-1', 60)).resolves.toBeUndefined();
      });
    });

    describe('close', () => {
      it('clears the pool reference so subsequent calls throw again (fail closed)', async () => {
        await tokenBlacklistService.close();

        await expect(tokenBlacklistService.isBlacklisted('jti-1')).rejects.toThrow(
          /used before init\(pool\)/
        );

        // Re-init for any tests that might run after this one in the file.
        tokenBlacklistService.init(mockPool as unknown as Pool);
      });
    });
  });
});
