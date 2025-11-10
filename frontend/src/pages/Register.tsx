import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';

/**
 * Registration page
 */

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1, 'Name is required').optional(),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export const Register: React.FC = () => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setError('');
    setIsSubmitting(true);

    try {
      await registerUser(data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-neutral mb-2">EzSign</h1>
          <p className="text-base-content/60">Sign documents with ease</p>
        </div>

        <div className="card-docuseal">
          <h2 className="text-2xl font-semibold text-neutral mb-6 text-center">Create Account</h2>

          {error && (
            <div className="alert alert-error mb-6 bg-error/10 border border-error/20 rounded-lg p-4">
              <svg
                className="w-5 h-5 text-error"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-error text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral mb-2">
                Name <span className="text-base-content/40">(Optional)</span>
              </label>
              <input
                {...register('name')}
                type="text"
                placeholder="John Doe"
                className="input-docuseal"
              />
              {errors.name && <div className="text-error text-sm mt-1">{errors.name.message}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral mb-2">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="input-docuseal"
              />
              {errors.email && (
                <div className="text-error text-sm mt-1">{errors.email.message}</div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral mb-2">Password</label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="input-docuseal"
              />
              {errors.password && (
                <div className="text-error text-sm mt-1">{errors.password.message}</div>
              )}
              <div className="text-xs text-base-content/50 mt-1">
                Must be at least 8 characters with letters and numbers
              </div>
            </div>

            <Button type="submit" loading={isSubmitting} fullWidth size="lg">
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-base-300 text-center text-sm">
            <span className="text-base-content/60">Already have an account? </span>
            <Link
              to="/login"
              className="text-neutral font-medium hover:text-neutral/80 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
