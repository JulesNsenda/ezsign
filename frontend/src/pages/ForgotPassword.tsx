import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import authService from '@/services/authService';

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
      setError(
        err.response?.data?.error?.message || 'Failed to send reset email. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div
          style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            width: '100%',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}
          >
            ✉️
          </div>
          <h2 style={{ marginBottom: '1rem' }}>Check Your Email</h2>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            We've sent you a password reset link. Please check your email and follow the
            instructions.
          </p>
          <Link
            to="/login"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontWeight: '500',
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h1 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Forgot Password?</h1>
        <p
          style={{
            marginBottom: '1.5rem',
            textAlign: 'center',
            color: '#666',
            fontSize: '0.875rem',
          }}
        >
          Enter your email and we'll send you a reset link
        </p>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c33',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
            />
            {errors.email && (
              <div style={{ color: '#c33', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.email.message}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: isSubmitting ? '#999' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
          >
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
          Remember your password?{' '}
          <Link to="/login" style={{ color: '#007bff', textDecoration: 'none', fontWeight: '500' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
