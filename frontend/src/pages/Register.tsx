import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useDefaultBranding } from '@/hooks/useBranding';
import Button from '@/components/Button';
import PublicNavbar from '@/components/PublicNavbar';

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
  // `.optional()` admits `undefined`, but react-hook-form submits `''` for an
  // untouched input, so pairing it with `.min(1)` made a blank Name block
  // submission with "Name is required" on a field that is meant to be
  // optional -- including on the invited-signup path. Name is genuinely
  // optional (the backend's `register` never reads it), so drop the
  // contradictory floor rather than special-casing the empty string.
  name: z.string().optional(),
});

type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Extracts a user-facing message from an axios error response. Backend error
 * envelopes are inconsistent across authController - most nest
 * `{error: {message}}`, but the registration gate's 403 sends
 * `{error: 'Forbidden', message: '...'}` where `error` is a plain string.
 * Handle both rather than assuming one shape (a `data.error?.message` read
 * silently resolves to `undefined` for the string-error shape).
 */
function extractErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const nestedMessage =
    data?.error && typeof data.error === 'object' ? data.error?.message : undefined;
  if (typeof nestedMessage === 'string' && nestedMessage) return nestedMessage;
  if (typeof data?.message === 'string' && data.message) return data.message;
  return fallback;
}

export const Register: React.FC = () => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Present when arriving via a team invitation link (see AcceptInvitation.tsx)
  // - lets the backend's invitation-scoped exemption through even while
  // registration is closed.
  const invitationToken = searchParams.get('invitationToken') || undefined;
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // registrationEnabled gates the form below. Fetch failure fails closed
  // (the backend 403 is the real gate; this is a courtesy check only), and
  // an invitation token bypasses the check entirely - the backend decides.
  const {
    data: brandingData,
    isLoading: isBrandingLoading,
    isError: isBrandingError,
    refetch: refetchBranding,
  } = useDefaultBranding();
  const registrationEnabled = brandingData?.registrationEnabled ?? false;

  const showChecking = !invitationToken && isBrandingLoading;
  const showCheckFailed = !invitationToken && !isBrandingLoading && isBrandingError;
  const showClosed =
    !invitationToken && !isBrandingLoading && !isBrandingError && !registrationEnabled;
  const showForm = !!invitationToken || (!isBrandingLoading && !isBrandingError && registrationEnabled);

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
      await registerUser({ ...data, invitationToken });
      // The backend's invitation exemption (hasInvitationExemption) only
      // checks the token to allow registration through - it does not accept
      // the invitation itself (that's invitationService.accept, a separate
      // authenticated step). So an invited signup must land back on the
      // accept-invitation page, now authenticated, rather than the
      // dashboard - otherwise the account exists but never joins the team.
      navigate(invitationToken ? `/accept-invitation/${invitationToken}` : '/', { replace: true });
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100">
      <PublicNavbar />
      <div className="flex items-center justify-center bg-gradient-to-br from-base-200 via-base-200 to-base-300 px-4 py-12 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8">
          {showChecking && (
            <div className="text-center py-8">
              <span className="loading loading-spinner loading-lg" />
            </div>
          )}

          {showCheckFailed && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral mb-2 text-center">
                Couldn't check sign-up status
              </h2>
              <p className="text-sm text-base-content/60 mb-6 text-center">
                We couldn't reach the server to check whether sign-up is currently open. Please try
                again.
              </p>
              <Button variant="outline" fullWidth onClick={() => refetchBranding()}>
                Retry
              </Button>
              <div className="mt-6 pt-6 border-t border-base-300 text-center text-sm">
                <span className="text-base-content/60">Already have an account? </span>
                <Link to="/login" className="text-neutral font-medium hover:text-neutral/80 transition-colors">
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {showClosed && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-neutral/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-neutral" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral mb-2 text-center">Sign-up is closed</h2>
              <p className="text-sm text-base-content/60 mb-6 text-center">
                This EzSign instance isn't accepting new sign-ups right now. Ask your team admin
                for an invitation.
              </p>
              <div className="pt-2 border-t border-base-300 text-center text-sm">
                <span className="text-base-content/60">Already have an account? </span>
                <Link to="/login" className="text-neutral font-medium hover:text-neutral/80 transition-colors">
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {showForm && (
            <>
              <h2 className="text-2xl font-semibold text-neutral mb-6 text-center">Create Account</h2>

              {error && (
                <div className="alert alert-error mb-6 bg-error/10 border border-error/20 rounded-lg p-4">
                  <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-error text-sm">{error}</span>
                </div>
              )}

              <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                  {errors.name && (
                    <div className="text-error text-sm mt-1">
                      {errors.name.message}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral mb-2">
                    Email
                  </label>
                  <input
                    {...register('email')}
                    type="email"
                    placeholder="you@example.com"
                    className="input-docuseal"
                  />
                  {errors.email && (
                    <div className="text-error text-sm mt-1">
                      {errors.email.message}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral mb-2">
                    Password
                  </label>
                  <input
                    {...register('password')}
                    type="password"
                    placeholder="••••••••"
                    className="input-docuseal"
                  />
                  {errors.password && (
                    <div className="text-error text-sm mt-1">
                      {errors.password.message}
                    </div>
                  )}
                  <div className="text-xs text-base-content/50 mt-1">
                    Must be at least 8 characters with letters and numbers
                  </div>
                </div>

                <Button
                  type="submit"
                  loading={isSubmitting}
                  fullWidth
                  size="lg"
                >
                  {isSubmitting ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-base-300 text-center text-sm">
                <span className="text-base-content/60">Already have an account? </span>
                <Link to="/login" className="text-neutral font-medium hover:text-neutral/80 transition-colors">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="text-center text-sm text-base-content/50 mt-8">
          <div className="mb-2">
            <Link to="/privacy" className="hover:text-neutral transition-colors">Privacy Policy</Link>
            <span className="mx-2">|</span>
            <Link to="/terms" className="hover:text-neutral transition-colors">Terms of Service</Link>
            <span className="mx-2">|</span>
            <Link to="/contact" className="hover:text-neutral transition-colors">Contact</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} EzSign. All rights reserved.</p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Register;
