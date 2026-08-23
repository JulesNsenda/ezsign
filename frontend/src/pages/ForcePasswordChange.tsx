import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';

/**
 * Force password change page
 *
 * Shown when the authenticated user's account is flagged with
 * `must_change_password` (e.g. first login after admin bootstrap).
 * The server rejects every other authenticated route until this
 * completes, so this page has no way out except a successful submit.
 */

const forcePasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ForcePasswordChangeFormData = z.infer<typeof forcePasswordChangeSchema>;

export const ForcePasswordChange: React.FC = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForcePasswordChangeFormData>({
    resolver: zodResolver(forcePasswordChangeSchema),
  });

  const onSubmit = async (data: ForcePasswordChangeFormData) => {
    setError('');
    setIsSubmitting(true);

    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      const { accessToken, refreshToken } = response.data;

      // Store the fresh token pair the same way AuthContext.login does
      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
      }
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }

      // Re-fetch the current user so `must_change_password` reflects the
      // cleared flag before ProtectedRoute re-evaluates the redirect.
      await refreshUser();

      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Failed to change password. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-200 via-base-200 to-base-300 px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <img
            src="/icon-192.png"
            alt=""
            className="inline-block w-16 h-16 rounded-2xl mb-4 shadow-lg"
          />
          <h1 className="text-4xl font-bold text-neutral mb-2">EzSign</h1>
          <p className="text-base-content/60">Sign documents with ease</p>
        </div>

        <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8">
          <h2 className="text-2xl font-semibold text-neutral mb-2 text-center">Change Your Password</h2>
          <p className="text-base-content/60 text-center mb-6">
            You must change your password before continuing.
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-3 mb-6 bg-error/10 border border-error/20 rounded-xl p-4 animate-slide-down"
            >
              <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-error text-sm font-medium">{error}</span>
            </div>
          )}

          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label htmlFor="current-password" className="block text-sm font-semibold text-neutral mb-2">
                Current Password
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  {...register('currentPassword')}
                  id="current-password"
                  type="password"
                  placeholder="••••••••"
                  className="input-docuseal pl-10"
                  aria-invalid={!!errors.currentPassword}
                  aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
                  autoComplete="current-password"
                />
              </div>
              {errors.currentPassword && (
                <div id="current-password-error" role="alert" className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                  </svg>
                  {errors.currentPassword.message}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-neutral mb-2">
                New Password
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  {...register('newPassword')}
                  id="new-password"
                  type="password"
                  placeholder="Enter new password (min 8 characters)"
                  className="input-docuseal pl-10"
                  aria-invalid={!!errors.newPassword}
                  aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
                  autoComplete="new-password"
                />
              </div>
              {errors.newPassword && (
                <div id="new-password-error" role="alert" className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                  </svg>
                  {errors.newPassword.message}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-neutral mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  {...register('confirmPassword')}
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  className="input-docuseal pl-10"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                  autoComplete="new-password"
                />
              </div>
              {errors.confirmPassword && (
                <div id="confirm-password-error" role="alert" className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
              Change Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
