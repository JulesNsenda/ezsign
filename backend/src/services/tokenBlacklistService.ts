import { Pool } from 'pg';
import logger from '@/services/loggerService';

/**
 * Fallback TTL for a user-wide revocation entry when JWT_REFRESH_TOKEN_EXPIRY
 * is unset or unparseable - same 7-day default tokenService.ts:32 falls back
 * to for the refresh token's own expiry (`process.env.JWT_REFRESH_TOKEN_EXPIRY
 * || '7d'`).
 */
const FALLBACK_MAX_USER_REVOCATION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/**
 * Parse a jsonwebtoken-style expiry string into seconds. Supports the
 * formats JWT_REFRESH_TOKEN_EXPIRY is documented to accept: a bare number of
 * seconds (e.g. '3600') or a number suffixed with s/m/h/d (e.g. '15m', '7d',
 * '12h') - the same suffix set tokenService.ts's own `parseExpiry` supports,
 * plus the bare-seconds form jsonwebtoken/ms also accepts for a numeric
 * string. Returns `null` on anything else so the caller can fall back and
 * log a warning, rather than silently mis-parsing.
 */
const parseExpiryToSeconds = (value: string): number | null => {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  const match = trimmed.match(/^(\d+)(s|m|h|d)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const amount = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      return null;
  }
};

/**
 * Default TTL for a user-wide revocation entry: must cover the longest-lived
 * refresh token that could still be presented. Derived from
 * JWT_REFRESH_TOKEN_EXPIRY (same env var and default as tokenService.ts:32)
 * rather than a hardcoded 7 days, so a deployment that changes its refresh
 * token lifetime doesn't end up with a revocation window shorter than the
 * tokens it's meant to cover. Read fresh on every call (not cached at module
 * load) so it always reflects the current env - see its use as
 * `blacklistAllUserTokens`'s default parameter below.
 */
const getDefaultUserRevocationLifetimeSeconds = (): number => {
  const raw = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';
  const parsed = parseExpiryToSeconds(raw);

  if (parsed === null) {
    logger.warn(
      'Unparseable JWT_REFRESH_TOKEN_EXPIRY value; falling back to the 7-day revocation lifetime',
      { value: raw }
    );
    return FALLBACK_MAX_USER_REVOCATION_LIFETIME_SECONDS;
  }

  return parsed;
};

/**
 * Probability that a given write triggers an opportunistic sweep of expired
 * rows from both revocation tables. Cheap, no separate cron needed for
 * Stage 1 (Stage 2 can fold this into the pg-boss cleanup schedule instead).
 */
const CLEANUP_PROBABILITY = 0.01;

/**
 * Token blacklist service for managing JWT revocation.
 *
 * Postgres-backed (replaces the previous Redis-backed store). Two tables:
 *   - revoked_tokens: single-token revocation by jti (logout).
 *   - user_token_revocations: per-user "everything issued before this
 *     instant is revoked" (logout-all, password change).
 *
 * Fail-closed by design:
 *   - Calling any method before init(pool) throws. This is a startup/wiring
 *     bug, not a runtime condition to swallow.
 *   - Read methods (isBlacklisted, isUserSessionRevoked) treat a query error
 *     as "revoked" rather than "not revoked" -- with Postgres as the store,
 *     failing open buys no availability (the DB is already required for
 *     every other request) and is a pure security bypass.
 *   - Write methods (blacklistToken, blacklistAllUserTokens) stay
 *     best-effort: they log and swallow query errors rather than throw, so
 *     that a transient DB blip during logout/change-password never turns
 *     into a 500 for an action that has otherwise already succeeded.
 *     blacklistAllUserTokens() additionally returns a boolean success
 *     signal (still never throws) for the one caller that needs to know
 *     whether the revocation actually happened - the admin
 *     revoke-sessions endpoint, which must not report success on a
 *     transient DB error while the target's refresh token still works.
 *     logout-all and change-password remain free to ignore the return
 *     value, matching their existing best-effort behavior.
 */
class TokenBlacklistService {
  private pool: Pool | null = null;

  /**
   * Wire up the Postgres pool. Must be called once at bootstrap, before any
   * request that can reach the revocation checks (i.e. before routes are
   * mounted). Idempotent -- safe to call again with the same/a new pool.
   */
  init(pool: Pool): void {
    this.pool = pool;
    logger.info('Token blacklist service initialized with Postgres pool');
  }

  /**
   * Returns the configured pool, or throws if init() hasn't run yet.
   * Intentionally called outside the try/catch of each public method so an
   * uninitialized-service bug surfaces as a thrown error (fail closed by
   * rejecting the call), not as a caught-and-swallowed query error.
   */
  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('TokenBlacklistService used before init(pool) was called');
    }
    return this.pool;
  }

  /**
   * Opportunistically delete expired rows from both revocation tables.
   * Fire-and-forget from callers' perspective: failures are logged, never
   * thrown, since this is a housekeeping side-effect of a write, not the
   * write itself.
   */
  private async maybeCleanupExpired(pool: Pool): Promise<void> {
    if (Math.random() >= CLEANUP_PROBABILITY) {
      return;
    }

    try {
      await Promise.all([
        pool.query('DELETE FROM revoked_tokens WHERE expires_at < now()'),
        pool.query('DELETE FROM user_token_revocations WHERE expires_at < now()'),
      ]);
      logger.debug('Opportunistic revocation table cleanup completed');
    } catch (error) {
      logger.warn('Opportunistic revocation table cleanup failed', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Blacklist a specific token by its jti (JWT ID).
   * The token stays blacklisted until it would have expired naturally.
   *
   * @param jti - The JWT ID to blacklist
   * @param expiresInSeconds - Time until the token expires (TTL for the blacklist entry)
   */
  async blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
    const pool = this.getPool();
    const ttl = Math.max(expiresInSeconds, 1);

    try {
      await pool.query(
        `INSERT INTO revoked_tokens (jti, expires_at)
         VALUES ($1, now() + ($2 * interval '1 second'))
         ON CONFLICT (jti) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [jti, ttl]
      );
      logger.debug('Token blacklisted', { jti, ttl });
    } catch (error) {
      // Best-effort write: see class-level note. The caller (logout) has
      // already succeeded from the user's perspective; don't 500 it.
      logger.error('Failed to blacklist token', {
        jti,
        error: (error as Error).message,
      });
    }

    void this.maybeCleanupExpired(pool);
  }

  /**
   * Check if a token is blacklisted.
   *
   * @param jti - The JWT ID to check
   * @returns true if the token is blacklisted (or if the check itself failed -- fail closed)
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    const pool = this.getPool();

    try {
      const result = await pool.query(
        'SELECT EXISTS (SELECT 1 FROM revoked_tokens WHERE jti = $1 AND expires_at > now()) AS revoked',
        [jti]
      );
      return result.rows[0]?.revoked === true;
    } catch (error) {
      logger.error('Failed to check token blacklist; failing closed', {
        jti,
        error: (error as Error).message,
      });
      // Fail closed: an unreachable store means we cannot prove the token
      // is still valid, so treat it as revoked.
      return true;
    }
  }

  /**
   * Revoke all tokens for a specific user by recording a revocation instant.
   * Any token issued at or before this instant is considered invalid.
   *
   * @param userId - The user ID to revoke all tokens for
   * @param maxTokenLifetimeSeconds - How long to retain the revocation entry (default: derived from JWT_REFRESH_TOKEN_EXPIRY, matching the refresh token lifetime)
   * @returns `true` if the revocation was written, `false` if the write
   *   failed (still never throws - see class-level note). Callers that
   *   need to distinguish these (e.g. the admin revoke-sessions endpoint)
   *   must check the return value; callers treating this as fire-and-forget
   *   (logout-all, change-password) can continue to ignore it.
   */
  async blacklistAllUserTokens(
    userId: string,
    maxTokenLifetimeSeconds: number = getDefaultUserRevocationLifetimeSeconds()
  ): Promise<boolean> {
    const pool = this.getPool();
    const ttl = Math.max(maxTokenLifetimeSeconds, 1);
    let success = true;

    try {
      await pool.query(
        `INSERT INTO user_token_revocations (user_id, revoked_at, expires_at)
         VALUES ($1, now(), now() + ($2 * interval '1 second'))
         ON CONFLICT (user_id) DO UPDATE
           SET revoked_at = EXCLUDED.revoked_at,
               expires_at = EXCLUDED.expires_at`,
        [userId, ttl]
      );
      logger.info('All user tokens revoked', { userId });
    } catch (error) {
      // Best-effort write: see class-level note. Still doesn't throw -
      // callers that don't check the return value keep their existing
      // fire-and-forget behavior.
      logger.error('Failed to revoke all user tokens', {
        userId,
        error: (error as Error).message,
      });
      success = false;
    }

    void this.maybeCleanupExpired(pool);
    return success;
  }

  /**
   * Check if a user's session was revoked at or after the token was issued.
   *
   * @param userId - The user ID to check
   * @param issuedAt - The token's issued-at timestamp (iat claim, in seconds)
   * @returns true if the user's tokens were revoked (or if the check itself failed -- fail closed)
   */
  async isUserSessionRevoked(userId: string, issuedAt: number): Promise<boolean> {
    const pool = this.getPool();

    try {
      const result = await pool.query(
        'SELECT revoked_at FROM user_token_revocations WHERE user_id = $1 AND expires_at > now()',
        [userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const revokedAt: Date = result.rows[0].revoked_at;
      const revokedAtSeconds = Math.floor(revokedAt.getTime() / 1000);

      // Inclusive compare (`<=`, not `<`): a token issued in the very same
      // second as the revocation is treated as revoked too. This closes a
      // pre-existing race where a token minted at exactly the revocation
      // instant would otherwise slip through.
      return issuedAt <= revokedAtSeconds;
    } catch (error) {
      logger.error('Failed to check user session revocation; failing closed', {
        userId,
        error: (error as Error).message,
      });
      return true;
    }
  }

  /**
   * Release the service's reference to the pool. The pool itself is owned
   * and torn down by the caller (server bootstrap) -- this service never
   * calls pool.end(), since the pool may be shared with other services.
   * Kept for API compatibility with existing shutdown wiring.
   */
  async close(): Promise<void> {
    this.pool = null;
    logger.info('Token blacklist service pool reference cleared');
  }
}

// Export singleton instance
export const tokenBlacklistService = new TokenBlacklistService();
