import { z } from 'zod';
import {
  uuidSchema,
  paginationSchema,
  documentStatusSchema,
  workflowTypeSchema,
} from '@/middleware/validation';

/**
 * Document upload validation schema
 */
export const uploadDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
    team_id: uuidSchema.optional(),
    workflow_type: workflowTypeSchema.optional(),
  }),
});

/**
 * Document update validation schema
 */
export const updateDocumentSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    title: z.string().min(1, 'Title is required').max(255, 'Title too long').optional(),
    status: documentStatusSchema.optional(),
  }),
});

/**
 * Document ID parameter validation
 */
export const documentIdSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

/**
 * Document list query validation
 */
export const listDocumentsSchema = z.object({
  query: paginationSchema.extend({
    team_id: uuidSchema.optional(),
    status: documentStatusSchema.optional(),
    sort_by: z.enum(['created_at', 'updated_at', 'title']).optional(),
    sort_order: z.enum(['asc', 'desc']).optional(),
  }),
});

/**
 * Document thumbnail query validation
 */
export const thumbnailQuerySchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({
    width: z.string().regex(/^\d+$/).transform(Number).optional(),
    height: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});
