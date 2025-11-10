import { z } from 'zod';
import { uuidSchema, emailSchema, fieldTypeSchema } from '@/middleware/validation';

/**
 * Field creation validation schema
 */
export const createFieldSchema = z.object({
  params: z.object({
    id: uuidSchema, // document ID
  }),
  body: z.object({
    type: fieldTypeSchema,
    page: z.number().int().min(0, 'Page must be non-negative'),
    x: z.number().min(0, 'X coordinate must be non-negative'),
    y: z.number().min(0, 'Y coordinate must be non-negative'),
    width: z.number().positive('Width must be positive'),
    height: z.number().positive('Height must be positive'),
    required: z.boolean().optional(),
    signer_email: emailSchema.optional(),
    properties: z.record(z.string(), z.any()).optional(),
  }),
});

/**
 * Field update validation schema
 */
export const updateFieldSchema = z.object({
  params: z.object({
    id: uuidSchema, // document ID
    fieldId: uuidSchema,
  }),
  body: z.object({
    x: z.number().min(0).optional(),
    y: z.number().min(0).optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    required: z.boolean().optional(),
    signer_email: emailSchema.optional(),
    properties: z.record(z.string(), z.any()).optional(),
  }),
});

/**
 * Bulk field upsert validation schema
 */
export const bulkUpsertFieldsSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    fields: z.array(
      z.object({
        id: uuidSchema.optional(),
        type: fieldTypeSchema,
        page: z.number().int().min(0),
        x: z.number().min(0),
        y: z.number().min(0),
        width: z.number().positive(),
        height: z.number().positive(),
        required: z.boolean().optional(),
        signer_email: emailSchema.optional(),
        properties: z.record(z.string(), z.any()).optional(),
      })
    ),
  }),
});

/**
 * Field ID parameters validation
 */
export const fieldIdSchema = z.object({
  params: z.object({
    id: uuidSchema,
    fieldId: uuidSchema,
  }),
});

/**
 * Signer creation validation schema
 */
export const createSignerSchema = z.object({
  params: z.object({
    id: uuidSchema, // document ID
  }),
  body: z.object({
    email: emailSchema,
    name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
    signing_order: z.number().int().min(1, 'Signing order must be positive').optional(),
    role: z.string().max(100, 'Role too long').optional(),
  }),
});

/**
 * Signer update validation schema
 */
export const updateSignerSchema = z.object({
  params: z.object({
    id: uuidSchema,
    signerId: uuidSchema,
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    signing_order: z.number().int().min(1).optional(),
    role: z.string().max(100).optional(),
  }),
});

/**
 * Signer ID parameters validation
 */
export const signerIdSchema = z.object({
  params: z.object({
    id: uuidSchema,
    signerId: uuidSchema,
  }),
});

/**
 * Assign fields to signer validation schema
 */
export const assignFieldsSchema = z.object({
  params: z.object({
    id: uuidSchema,
    signerId: uuidSchema,
  }),
  body: z.object({
    field_ids: z.array(uuidSchema).min(1, 'At least one field ID is required'),
  }),
});
