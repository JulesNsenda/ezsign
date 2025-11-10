/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Centralized error handler middleware
 */
export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';

  // Log error for debugging
  if (statusCode >= 500) {
    console.error('Server Error:', err);
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
  details?: any,
): ApiError => {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code || `HTTP_${statusCode}`;
  error.details = details;
  return error;
};
