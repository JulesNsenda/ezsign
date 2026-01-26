import { getRedisConnection } from '@/config/queue';
import logger from '@/services/loggerService';
import Redis from 'ioredis';

/**
 * Redis key prefixes for token blacklisting
 */
const BLACKLIST_PREFIX = 'token:blacklist:';
const USER_REVOKED_PREFIX = 'token:revoked:';

/**
 * Token blacklist service for managing JWT revocation
 * Uses Redis for distributed, persistent storage
 */
class TokenBlacklistService {
  private redis: Redis | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize Redis connection lazily
   */
  private async ensureConnection(): Promise<Redis> {
    if (this.redis) {
      return this.redis;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.redis!;
    }

    this.initPromise = this.initialize();
    await this.initPromise;
    return this.redis!;
  }

  /**
   * Initialize the Redis connection
   */
  private async initialize(): Promise<void> {
    try {
      this.redis = getRedisConnection();
      // Test the connection
      await this.redis.ping();
      logger.info('Token blacklist service connected to Redis');
    } catch (error) {
      logger.error('Failed to connect to Redis for token blacklist', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Blacklist a specific token by its jti (JWT ID)
   * The token will be blacklisted until it would have expired naturally
   *
   * @param jti - The JWT ID to blacklist
   * @param expiresInSeconds - Time until the token expires (TTL for the blacklist entry)
   */
  async blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
    try {
      const redis = await this.ensureConnection();
      const key = `${BLACKLIST_PREFIX}${jti}`;

      // Store with TTL so it auto-expires when the token would have expired anyway
      await redis.setex(key, Math.max(expiresInSeconds, 1), '1');

      logger.debug('Token blacklisted', { jti, ttl: expiresInSeconds });
    } catch (error) {
      logger.error('Failed to blacklist token', {
        jti,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   *
   * @param jti - The JWT ID to check
   * @returns true if the token is blacklisted
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const redis = await this.ensureConnection();
      const key = `${BLACKLIST_PREFIX}${jti}`;

      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check token blacklist', {
        jti,
        error: (error as Error).message,
      });
      // Fail open - if Redis is down, allow the token
      // This is a trade-off between security and availability
      // In production, you might want to fail closed instead
      return false;
    }
  }

  /**
   * Revoke all tokens for a specific user by setting a revocation timestamp
   * Any token issued before this timestamp will be considered invalid
   *
   * @param userId - The user ID to revoke all tokens for
   * @param maxTokenLifetimeSeconds - Maximum token lifetime to set TTL (default: 7 days for refresh tokens)
   */
  async blacklistAllUserTokens(
    userId: string,
    maxTokenLifetimeSeconds: number = 7 * 24 * 60 * 60
  ): Promise<void> {
    try {
      const redis = await this.ensureConnection();
      const key = `${USER_REVOKED_PREFIX}${userId}`;
      const timestamp = Math.floor(Date.now() / 1000);

      // Store the revocation timestamp with TTL
      await redis.setex(key, maxTokenLifetimeSeconds, timestamp.toString());

      logger.info('All user tokens revoked', { userId, timestamp });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', {
        userId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Check if a user's session was revoked after the token was issued
   *
   * @param userId - The user ID to check
   * @param issuedAt - The token's issued-at timestamp (iat claim, in seconds)
   * @returns true if the user's tokens were revoked after the token was issued
   */
  async isUserSessionRevoked(userId: string, issuedAt: number): Promise<boolean> {
    try {
      const redis = await this.ensureConnection();
      const key = `${USER_REVOKED_PREFIX}${userId}`;

      const revokedAtStr = await redis.get(key);
      if (!revokedAtStr) {
        return false;
      }

      const revokedAt = parseInt(revokedAtStr, 10);
      // Token is revoked if it was issued before the revocation timestamp
      return issuedAt < revokedAt;
    } catch (error) {
      logger.error('Failed to check user session revocation', {
        userId,
        error: (error as Error).message,
      });
      // Fail open
      return false;
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.initPromise = null;
      logger.info('Token blacklist service disconnected from Redis');
    }
  }
}

// Export singleton instance
export const tokenBlacklistService = new TokenBlacklistService();
