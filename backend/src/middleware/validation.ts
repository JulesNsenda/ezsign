import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Validation middleware factory
 * Creates a middleware that validates request body, query, or params against a Zod schema
 */
export const validate = (schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate body
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      // Validate query
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query) as any;
      }

      // Validate params
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params) as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: (error as ZodError).issues.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
        });
        return;
      }

      // Pass other errors to error handler
      next(error);
    }
  };
};

/**
 * Common validation schemas
 */

// UUID parameter validation
export const uuidSchema = z.string().uuid();

// Pagination query validation
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// Email validation
export const emailSchema = z.string().email();

// Password validation (minimum 8 characters, at least one letter and one number)
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Document status validation
export const documentStatusSchema = z.enum(['draft', 'pending', 'completed', 'cancelled']);

// Workflow type validation
export const workflowTypeSchema = z.enum(['single', 'sequential', 'parallel']);

// Field type validation
export const fieldTypeSchema = z.enum(['signature', 'initials', 'date', 'text', 'checkbox']);
