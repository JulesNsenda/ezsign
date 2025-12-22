import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import authService from '@/services/authService';
import Button from '@/components/Button';

/**
 * Forgot password page
 */

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const ForgotPassword: React.FC = () => {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setError('');
    setIsSubmitting(true);

    try {
      await authService.forgotPassword(data);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-200 via-base-200 to-base-300 px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-neutral mb-2">Check Your Email</h2>
            <p className="text-base-content/60 mb-6">
              We've sent you a password reset link. Please check your email and follow the instructions.
            </p>
            <Link to="/login">
              <Button variant="primary" fullWidth>
                Back to Login
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
          <h2 className="text-2xl font-semibold text-neutral mb-2 text-center">Forgot Password?</h2>
          <p className="text-base-content/60 text-center mb-6">
            Enter your email and we'll send you a reset link
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
                Email Address
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  className="input-docuseal pl-10"
                />
              </div>
              {errors.email && (
                <div className="text-error text-sm mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                  </svg>
                  {errors.email.message}
                </div>
              )}
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              fullWidth
              size="lg"
            >
              Send Reset Link
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-base-300/50 text-center text-sm">
            <span className="text-base-content/60">Remember your password? </span>
            <Link to="/login" className="text-neutral font-semibold hover:text-neutral/80 transition-colors hover:underline underline-offset-4">
              Sign in
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

export default ForgotPassword;
