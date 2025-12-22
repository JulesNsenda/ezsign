import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Correlation ID header name
export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Extend Express Request type to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Middleware to add correlation IDs to requests for distributed tracing.
 *
 * - If the request includes an x-correlation-id header, it will be used.
 * - Otherwise, a new UUID will be generated.
 * - The correlation ID is added to both the request object and response header.
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Use existing correlation ID from header or generate a new one
  const existingId = req.headers[CORRELATION_ID_HEADER] as string | undefined;
  const correlationId = existingId || uuidv4();

  // Attach to request for use in handlers and services
  req.correlationId = correlationId;

  // Add to response headers for client tracking
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
};
