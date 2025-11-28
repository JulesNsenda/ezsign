import { Pool } from 'pg';
import Redis from 'ioredis';
import fs from 'fs/promises';
import logger from '@/services/loggerService';

/**
 * Health check result for individual component
 */
export interface HealthCheck {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

/**
 * Overall health status response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    storage: HealthCheck;
  };
}

/**
 * Readiness check response (simplified)
 */
export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

/**
 * Health Service
 * Provides health check functionality for liveness, readiness, and detailed diagnostics
 */
export class HealthService {
  private pool: Pool;
  private redis: Redis;
  private storagePath: string;

  // Cache for health check results to prevent thundering herd
  private cache: {
    readiness?: { result: ReadinessStatus; timestamp: number };
    detailed?: { result: HealthStatus; timestamp: number };
  } = {};
  private readonly READINESS_CACHE_TTL = 1000; // 1 second
  private readonly DETAILED_CACHE_TTL = 5000; // 5 seconds

  // Timeouts for health checks
  private readonly DB_TIMEOUT = 5000; // 5 seconds
  private readonly REDIS_TIMEOUT = 2000; // 2 seconds

  constructor(pool: Pool, redis: Redis, storagePath?: string) {
    this.pool = pool;
    this.redis = redis;
    this.storagePath = storagePath || process.env.FILE_STORAGE_PATH || './storage';
  }

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Use a promise race to implement timeout
      const queryPromise = this.pool.query('SELECT 1');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database timeout')), this.DB_TIMEOUT)
      );

      await Promise.race([queryPromise, timeoutPromise]);
      return { status: 'up', latency: Date.now() - start };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Database health check failed', { error: errorMessage });
      return { status: 'down', error: errorMessage, latency: Date.now() - start };
    }
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Use a promise race to implement timeout
      const pingPromise = this.redis.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), this.REDIS_TIMEOUT)
      );

      await Promise.race([pingPromise, timeoutPromise]);
      return { status: 'up', latency: Date.now() - start };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Redis health check failed', { error: errorMessage });
      return { status: 'down', error: errorMessage, latency: Date.now() - start };
    }
  }

  /**
   * Check storage accessibility
   */
  async checkStorage(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await fs.access(this.storagePath);
      // Verify we can write by checking directory stats
      await fs.stat(this.storagePath);
      return { status: 'up', latency: Date.now() - start };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Storage health check failed', { error: errorMessage, path: this.storagePath });
      return { status: 'down', error: errorMessage, latency: Date.now() - start };
    }
  }

  /**
   * Get readiness status (with caching)
   */
  async getReadinessStatus(): Promise<ReadinessStatus> {
    // Check cache
    const cached = this.cache.readiness;
    if (cached && Date.now() - cached.timestamp < this.READINESS_CACHE_TTL) {
      return cached.result;
    }

    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isReady = database.status === 'up' && redis.status === 'up';

    const result: ReadinessStatus = {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: database.status,
        redis: redis.status,
      },
    };

    // Update cache
    this.cache.readiness = { result, timestamp: Date.now() };

    return result;
  }

  /**
   * Get full health status (with caching)
   */
  async getFullStatus(): Promise<HealthStatus> {
    // Check cache
    const cached = this.cache.detailed;
    if (cached && Date.now() - cached.timestamp < this.DETAILED_CACHE_TTL) {
      return cached.result;
    }

    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    // Determine overall status
    // Critical dependencies: database and redis
    // Non-critical: storage (app can work with degraded storage)
    const criticalUp = database.status === 'up' && redis.status === 'up';
    const allUp = criticalUp && storage.status === 'up';
    const criticalDown = database.status === 'down' || redis.status === 'down';

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalDown) {
      status = 'unhealthy';
    } else if (!allUp) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks: { database, redis, storage },
    };

    // Update cache
    this.cache.detailed = { result, timestamp: Date.now() };

    return result;
  }
}
