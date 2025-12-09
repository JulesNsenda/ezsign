import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import authService from '@/services/authService';
import Button from '@/components/Button';

/**
 * Reset password page
 */

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await authService.resetPassword({
        token,
        password: data.password,
      });

      // Redirect to login with success message
      navigate('/login', {
        state: { message: 'Password reset successful. Please login with your new password.' },
      });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-200 via-base-200 to-base-300 px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-neutral mb-2">Invalid Reset Link</h2>
            <p className="text-base-content/60 mb-6">
              This password reset link is invalid or has expired.
            </p>
            <Link to="/forgot-password">
              <Button variant="primary" fullWidth>
                Request New Link
              </Button>
            </Link>
          </div>

          <div className="text-center text-sm text-base-content/50 mt-8">
            <div className="mb-2">
              <Link to="/privacy" className="hover:text-neutral transition-colors">Privacy Policy</Link>
              <span className="mx-2">|</span>
              <Link to="/terms" className="hover:text-neutral transition-colors">Terms of Service</Link>
              <span className="mx-2">|</span>
              <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
            </div>
            <p>© 2025 EzSign. All rights reserved.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-200 via-base-200 to-base-300 px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-neutral to-neutral/80 text-base-100 mb-4 shadow-lg">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-neutral mb-2">EzSign</h1>
          <p className="text-base-content/60">Sign documents with ease</p>
        </div>

        <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8">
          <h2 className="text-2xl font-semibold text-neutral mb-2 text-center">Reset Password</h2>
          <p className="text-base-content/60 text-center mb-6">
            Enter your new password below
          </p>

          {error && (
            <div className="flex items-start gap-3 mb-6 bg-error/10 border border-error/20 rounded-xl p-4 animate-slide-down">
              <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-error text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                New Password
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  className="input-docuseal pl-10"
                />
              </div>
              {errors.password && (
                <div className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                  </svg>
                  {errors.password.message}
                </div>
              )}
              <div className="text-xs text-base-content/50 mt-1">
                Must be at least 8 characters with letters and numbers
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  {...register('confirmPassword')}
                  type="password"
                  placeholder="••••••••"
                  className="input-docuseal pl-10"
                />
              </div>
              {errors.confirmPassword && (
                <div className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                  </svg>
                  {errors.confirmPassword.message}
                </div>
              )}
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              fullWidth
              size="lg"
            >
              Reset Password
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-base-300/50 text-center text-sm">
            <Link to="/login" className="text-neutral font-semibold hover:text-neutral/80 transition-colors hover:underline underline-offset-4">
              Back to Login
            </Link>
          </div>
        </div>

        <div className="text-center text-sm text-base-content/50 mt-8">
          <div className="mb-2">
            <Link to="/privacy" className="hover:text-neutral transition-colors">Privacy Policy</Link>
            <span className="mx-2">|</span>
            <Link to="/terms" className="hover:text-neutral transition-colors">Terms of Service</Link>
            <span className="mx-2">|</span>
            <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
          </div>
          <p>© 2025 EzSign. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
