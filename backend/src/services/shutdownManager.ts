import logger from '@/services/loggerService';

/**
 * Interface for resources that can be gracefully shut down
 */
export interface ShutdownableResource {
  name: string;
  close: () => Promise<void>;
  /** Optional priority (higher = closes first). Default: 0 */
  priority?: number;
}

/**
 * Shutdown statistics for logging
 */
interface ShutdownStats {
  resourceName: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Manages graceful shutdown of the application
 *
 * Features:
 * - Registers resources for cleanup
 * - Closes resources in reverse order (LIFO) with priority support
 * - Timeout protection to prevent hanging
 * - Logs shutdown progress and statistics
 */
class ShutdownManager {
  private resources: ShutdownableResource[] = [];
  private isShuttingDown = false;
  private readonly defaultTimeout: number;

  constructor(timeoutMs: number = 30000) {
    this.defaultTimeout = timeoutMs;
  }

  /**
   * Register a resource for graceful shutdown
   * Resources are closed in reverse order of registration (LIFO)
   * Higher priority resources are closed first within each order
   *
   * @param resource - The resource to register
   */
  register(resource: ShutdownableResource): void {
    this.resources.push({
      ...resource,
      priority: resource.priority ?? 0,
    });
    logger.debug('Resource registered for shutdown', { name: resource.name });
  }

  /**
   * Unregister a resource (e.g., if it was already closed)
   *
   * @param name - The name of the resource to unregister
   */
  unregister(name: string): void {
    const index = this.resources.findIndex((r) => r.name === name);
    if (index !== -1) {
      this.resources.splice(index, 1);
      logger.debug('Resource unregistered from shutdown', { name });
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Initiate graceful shutdown
   *
   * @param signal - The signal that triggered shutdown (e.g., 'SIGTERM', 'SIGINT')
   * @param timeoutMs - Optional timeout override in milliseconds
   */
  async shutdown(signal: string, timeoutMs?: number): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal', { signal });
      return;
    }

    this.isShuttingDown = true;
    const timeout = timeoutMs ?? this.defaultTimeout;
    const startTime = Date.now();
    const stats: ShutdownStats[] = [];

    logger.info('Graceful shutdown initiated', {
      signal,
      timeout,
      resourceCount: this.resources.length,
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      // Race between shutdown completion and timeout
      await Promise.race([
        this.closeAllResources(stats),
        timeoutPromise,
      ]);

      const totalDuration = Date.now() - startTime;
      logger.info('Graceful shutdown completed', {
        duration: totalDuration,
        resourcesClosed: stats.filter((s) => s.success).length,
        resourcesFailed: stats.filter((s) => !s.success).length,
      });

      // Log individual resource stats
      for (const stat of stats) {
        if (stat.success) {
          logger.debug('Resource closed successfully', {
            resource: stat.resourceName,
            duration: stat.duration,
          });
        } else {
          logger.warn('Resource failed to close', {
            resource: stat.resourceName,
            duration: stat.duration,
            error: stat.error,
          });
        }
      }

      process.exit(0);
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Graceful shutdown failed or timed out', {
        error: errorMessage,
        duration: totalDuration,
        resourcesClosed: stats.filter((s) => s.success).length,
        resourcesPending: this.resources.length - stats.length,
      });

      // Force exit after timeout
      process.exit(1);
    }
  }

  /**
   * Close all registered resources
   * Resources are sorted by priority (descending) and then closed in reverse registration order
   */
  private async closeAllResources(stats: ShutdownStats[]): Promise<void> {
    // Sort by priority (descending) - higher priority closes first
    // Within same priority, close in reverse registration order (LIFO)
    const sortedResources = [...this.resources].sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      // For same priority, reverse order (LIFO)
      return this.resources.indexOf(b) - this.resources.indexOf(a);
    });

    for (const resource of sortedResources) {
      const resourceStart = Date.now();
      const stat: ShutdownStats = {
        resourceName: resource.name,
        duration: 0,
        success: false,
      };

      try {
        logger.debug('Closing resource', { name: resource.name });
        await resource.close();
        stat.success = true;
      } catch (error) {
        stat.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to close resource', {
          name: resource.name,
          error: stat.error,
        });
      }

      stat.duration = Date.now() - resourceStart;
      stats.push(stat);
    }
  }

  /**
   * Install signal handlers for graceful shutdown
   * This should be called once after all resources are registered
   */
  installSignalHandlers(): void {
    const handleSignal = (signal: string) => {
      this.shutdown(signal);
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));

    // Handle uncaught exceptions gracefully
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception, initiating shutdown', {
        error: error.message,
        stack: error.stack,
      });
      this.shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection, initiating shutdown', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      this.shutdown('unhandledRejection');
    });

    logger.info('Shutdown signal handlers installed');
  }
}

// Export singleton instance with 30-second default timeout
export const shutdownManager = new ShutdownManager(30000);
