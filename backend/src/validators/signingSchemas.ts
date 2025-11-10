import { z } from 'zod';
import { uuidSchema } from '@/middleware/validation';

/**
 * Send for signature validation schema
 */
export const sendForSignatureSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    message: z.string().max(1000, 'Message too long').optional(),
    send_emails: z.boolean().optional(),
  }),
});

/**
 * Signing token parameter validation
 */
export const signingTokenSchema = z.object({
  params: z.object({
    token: z.string().min(1, 'Signing token is required'),
  }),
});

/**
 * Submit signature validation schema
 */
export const submitSignatureSchema = z.object({
  params: z.object({
    token: z.string().min(1, 'Signing token is required'),
  }),
  body: z.object({
    signatures: z.array(
      z.object({
        field_id: uuidSchema,
        signature_type: z.enum(['drawn', 'typed', 'uploaded']),
        signature_data: z.string().min(1, 'Signature data is required'),
      })
    ).min(1, 'At least one signature is required'),
  }),
});

/**
 * Webhook creation validation schema
 */
export const createWebhookSchema = z.object({
  body: z.object({
    url: z.string().url('Invalid webhook URL'),
    events: z.array(
      z.enum([
        'document.created',
        'document.sent',
        'document.viewed',
        'document.signed',
        'document.completed',
        'document.declined',
      ])
    ).min(1, 'At least one event is required'),
    description: z.string().max(255, 'Description too long').optional(),
  }),
});

/**
 * Webhook update validation schema
 */
export const updateWebhookSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    url: z.string().url().optional(),
    events: z.array(
      z.enum([
        'document.created',
        'document.sent',
        'document.viewed',
        'document.signed',
        'document.completed',
        'document.declined',
      ])
    ).optional(),
    active: z.boolean().optional(),
    description: z.string().max(255).optional(),
  }),
});

/**
 * Webhook ID parameter validation
 */
export const webhookIdSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

/**
 * Webhook event ID parameter validation
 */
export const webhookEventIdSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});
