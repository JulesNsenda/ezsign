import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';

/**
 * Login page
 */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    setIsSubmitting(true);

    try {
      await login(data);

      // Redirect to the page they were trying to access, or home
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <h2 className="text-2xl font-semibold text-neutral mb-6 text-center">Welcome Back</h2>

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

            <div>
              <label className="block text-sm font-semibold text-neutral mb-2">
                Password
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
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              fullWidth
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/forgot-password" className="text-sm text-neutral hover:text-neutral/80 transition-colors font-medium hover:underline underline-offset-4">
              Forgot password?
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-base-300/50 text-center text-sm">
            <span className="text-base-content/60">Don't have an account? </span>
            <Link to="/register" className="text-neutral font-semibold hover:text-neutral/80 transition-colors hover:underline underline-offset-4">
              Sign up
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

export default Login;
