/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/middleware/validation';

/**
 * Registration request validation schema
 */
export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  }),
});

/**
 * Login request validation schema
 */
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),
});

/**
 * Password reset request validation schema
 */
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

/**
 * Password reset validation schema
 */
export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
  }),
});

/**
 * Email verification validation schema
 */
export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

/**
 * Refresh token validation schema
 */
export const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required'),
  }),
});
