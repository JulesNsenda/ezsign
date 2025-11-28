import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Log levels: error: 0, warn: 1, info: 2, http: 3, debug: 4
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Color coding for console output in development
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};

winston.addColors(logColors);

// Get the log directory - use absolute path from project root
const getLogDir = (): string => {
  return process.env.LOG_DIR || path.join(__dirname, '../../../logs');
};

// JSON format for production (structured logging)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Pretty format for development (human-readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    const corrId = correlationId ? `[${correlationId}] ` : '';
    const metaStr = Object.keys(meta).length > 0
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';
    return `${timestamp} ${level} ${corrId}${message}${metaStr}`;
  })
);

// Determine log level from environment
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

// Create transports based on environment
const createTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Console transport - always enabled
  transports.push(
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? jsonFormat : devFormat,
    })
  );

  // File transports - only in production or if explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
    const logDir = getLogDir();

    // Daily rotating file for all logs
    transports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: 'ezsign-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d', // Keep 14 days of logs
        maxSize: '20m', // Rotate if file exceeds 20MB
        format: jsonFormat,
      })
    );

    // Separate file for errors only
    transports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: 'ezsign-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d', // Keep 30 days of error logs
        maxSize: '20m',
        level: 'error',
        format: jsonFormat,
      })
    );
  }

  return transports;
};

// Create the main logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: getLogLevel(),
  transports: createTransports(),
  // Handle uncaught exceptions and rejections
  exceptionHandlers: process.env.NODE_ENV === 'production'
    ? [
        new DailyRotateFile({
          dirname: getLogDir(),
          filename: 'ezsign-exceptions-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          format: jsonFormat,
        }),
      ]
    : undefined,
  rejectionHandlers: process.env.NODE_ENV === 'production'
    ? [
        new DailyRotateFile({
          dirname: getLogDir(),
          filename: 'ezsign-rejections-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          format: jsonFormat,
        }),
      ]
    : undefined,
});

/**
 * Create a child logger with additional context
 * Useful for request-scoped logging with correlation IDs
 */
export const createChildLogger = (context: Record<string, unknown>): winston.Logger => {
  return logger.child(context);
};

/**
 * Create a request-scoped logger with correlation ID
 */
export const createRequestLogger = (correlationId: string): winston.Logger => {
  return logger.child({ correlationId });
};

/**
 * Sanitize sensitive data from log objects
 * Removes passwords, tokens, API keys, etc.
 */
export const sanitizeLogData = (data: Record<string, unknown>): Record<string, unknown> => {
  const sensitiveKeys = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// Export logger instance as default
export { logger };
export default logger;
