import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  /** Set by body-parser/raw-body on error (e.g. 'entity.too.large'). */
  type?: string;
}

/**
 * Centralized error handler middleware
 */
export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // body-parser (via raw-body) throws this for an oversized JSON body;
  // multer throws a LIMIT_FILE_SIZE error (no `type`, no `statusCode`) for an
  // oversized file upload - the more common oversize path in practice (see
  // documentController's 10MB and brandingRoutes' 2MB multer limits). Handle
  // both explicitly rather than relying on the incidental `statusCode` either
  // happens to carry, so the response envelope gets a meaningful `code`
  // instead of the generic INTERNAL_ERROR fallback below.
  const isPayloadTooLarge = err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE';
  const statusCode = isPayloadTooLarge ? 413 : err.statusCode || 500;
  const message = isPayloadTooLarge ? 'Request body too large' : err.message || 'Internal Server Error';
  const code = isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : err.code || 'INTERNAL_ERROR';

  // Log error for debugging
  if (statusCode >= 500) {
    logger.error('Server error', {
      error: err.message,
      stack: err.stack,
      code,
      statusCode,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
    });
  } else {
    logger.warn('Client error', {
      error: err.message,
      code,
      statusCode,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
};

/**
 * Create API error
 */
export const createApiError = (
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: any
): ApiError => {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code || `HTTP_${statusCode}`;
  error.details = details;
  return error;
};
