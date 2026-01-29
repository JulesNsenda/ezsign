/**
 * Database Service with Query Performance Logging
 *
 * Wraps PostgreSQL pool to provide:
 * - Query timing and slow query logging
 * - Query pattern tracking for performance analysis
 * - Connection pool monitoring
 */

import { Pool, PoolClient, QueryResult, QueryConfig } from 'pg';
import logger from './loggerService';

// Configuration
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100', 10);
const LOG_ALL_QUERIES = process.env.LOG_ALL_QUERIES === 'true';

/**
 * Query statistics tracker
 */
interface QueryStats {
  count: number;
  totalDuration: number;
  maxDuration: number;
  slowCount: number;
}

const queryStats = new Map<string, QueryStats>();

/**
 * Extract a normalized query pattern for tracking
 * Replaces parameter values with placeholders
 */
function normalizeQuery(sql: string): string {
  // Truncate to first 100 chars for pattern matching
  const truncated = sql.substring(0, 100).trim();
  // Collapse whitespace
  return truncated.replace(/\s+/g, ' ');
}

/**
 * Update query statistics
 */
function updateQueryStats(pattern: string, duration: number, isSlow: boolean): void {
  const existing = queryStats.get(pattern) || {
    count: 0,
    totalDuration: 0,
    maxDuration: 0,
    slowCount: 0,
  };

  existing.count++;
  existing.totalDuration += duration;
  existing.maxDuration = Math.max(existing.maxDuration, duration);
  if (isSlow) {
    existing.slowCount++;
  }

  queryStats.set(pattern, existing);
}

/**
 * Create a monitored pool wrapper
 */
export function createMonitoredPool(pool: Pool): Pool {
  const originalQuery = pool.query.bind(pool);

  // Override the query method with typed overloads
  (pool.query as any) = async function monitoredQuery(
    textOrConfig: string | QueryConfig,
    values?: unknown[]
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const sql =
      typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;
    const pattern = normalizeQuery(sql);

    try {
      // Execute the actual query
      const result: QueryResult = await (typeof textOrConfig === 'string'
        ? originalQuery(textOrConfig, values)
        : originalQuery(textOrConfig));

      const duration = Date.now() - startTime;
      const isSlow = duration >= SLOW_QUERY_THRESHOLD_MS;

      // Update statistics
      updateQueryStats(pattern, duration, isSlow);

      // Log slow queries
      if (isSlow) {
        logger.warn('Slow database query detected', {
          duration: `${duration}ms`,
          threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
          query: sql.substring(0, 500), // Truncate for logging
          rowCount: result.rowCount,
          paramCount: values?.length || 0,
        });
      } else if (LOG_ALL_QUERIES) {
        logger.debug('Database query executed', {
          duration: `${duration}ms`,
          query: pattern,
          rowCount: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log query errors with timing
      logger.error('Database query failed', {
        duration: `${duration}ms`,
        query: sql.substring(0, 500),
        error: (error as Error).message,
      });

      throw error;
    }
  };

  return pool;
}

/**
 * Get query performance statistics
 */
export function getQueryStats(): {
  patterns: Array<{
    pattern: string;
    count: number;
    avgDuration: number;
    maxDuration: number;
    slowCount: number;
  }>;
  summary: {
    totalQueries: number;
    totalSlowQueries: number;
    slowQueryPercentage: number;
  };
} {
  let totalQueries = 0;
  let totalSlowQueries = 0;

  const patterns = Array.from(queryStats.entries()).map(([pattern, stats]) => {
    totalQueries += stats.count;
    totalSlowQueries += stats.slowCount;

    return {
      pattern,
      count: stats.count,
      avgDuration: Math.round(stats.totalDuration / stats.count),
      maxDuration: stats.maxDuration,
      slowCount: stats.slowCount,
    };
  });

  // Sort by slow count descending
  patterns.sort((a, b) => b.slowCount - a.slowCount);

  return {
    patterns: patterns.slice(0, 50), // Top 50 patterns
    summary: {
      totalQueries,
      totalSlowQueries,
      slowQueryPercentage:
        totalQueries > 0
          ? Math.round((totalSlowQueries / totalQueries) * 100 * 100) / 100
          : 0,
    },
  };
}

/**
 * Reset query statistics (useful for testing)
 */
export function resetQueryStats(): void {
  queryStats.clear();
}

/**
 * Log periodic query statistics summary
 */
export function logQueryStatsSummary(): void {
  const stats = getQueryStats();

  if (stats.summary.totalQueries === 0) {
    return;
  }

  logger.info('Query performance summary', {
    totalQueries: stats.summary.totalQueries,
    slowQueries: stats.summary.totalSlowQueries,
    slowPercentage: `${stats.summary.slowQueryPercentage}%`,
  });

  // Log top slow query patterns
  const topSlow = stats.patterns.filter((p) => p.slowCount > 0).slice(0, 5);
  if (topSlow.length > 0) {
    logger.info('Top slow query patterns', {
      patterns: topSlow.map((p) => ({
        query: p.pattern,
        slowCount: p.slowCount,
        maxDuration: `${p.maxDuration}ms`,
      })),
    });
  }
}

/**
 * Monitor pool connection stats
 */
export function getPoolStats(pool: Pool): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Create monitored client wrapper (for transactions)
 */
export async function getMonitoredClient(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  const originalClientQuery = client.query.bind(client);

  (client.query as any) = async function monitoredClientQuery(
    textOrConfig: string | QueryConfig,
    values?: unknown[]
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const sql =
      typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;
    const pattern = normalizeQuery(sql);

    try {
      const result: QueryResult = await (typeof textOrConfig === 'string'
        ? originalClientQuery(textOrConfig, values)
        : originalClientQuery(textOrConfig));

      const duration = Date.now() - startTime;
      const isSlow = duration >= SLOW_QUERY_THRESHOLD_MS;

      updateQueryStats(pattern, duration, isSlow);

      if (isSlow) {
        logger.warn('Slow database query detected (transaction)', {
          duration: `${duration}ms`,
          threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
          query: sql.substring(0, 500),
          rowCount: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Database query failed (transaction)', {
        duration: `${duration}ms`,
        query: sql.substring(0, 500),
        error: (error as Error).message,
      });
      throw error;
    }
  };

  return client;
}
