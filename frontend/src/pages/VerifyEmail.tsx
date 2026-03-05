import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import authService from '@/services/authService';
import Button from '@/components/Button';

/**
 * Email verification page - handles the verification token from email links
 */

export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid or missing verification token.');
      return;
    }

    const verify = async () => {
      try {
        await authService.verifyEmail(token);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(
          err.response?.data?.message || 'Failed to verify email. The link may have expired.'
        );
      }
    };

    verify();
  }, [token]);

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

        <div className="bg-base-100 rounded-2xl shadow-xl border border-base-300/50 p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 rounded-full bg-info/10 flex items-center justify-center mx-auto mb-4">
                <span className="loading loading-spinner loading-lg text-info"></span>
              </div>
              <h2 className="text-2xl font-semibold text-neutral mb-2">Verifying Email</h2>
              <p className="text-base-content/60">
                Please wait while we verify your email address...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-neutral mb-2">Email Verified</h2>
              <p className="text-base-content/60 mb-6">
                Your email has been verified successfully. You can now use all features of EzSign.
              </p>
              <Link to="/login">
                <Button variant="primary" fullWidth>
                  Go to Login
                </Button>
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-neutral mb-2">Verification Failed</h2>
              <p className="text-base-content/60 mb-6">
                {errorMessage}
              </p>
              <Link to="/login">
                <Button variant="primary" fullWidth>
                  Go to Login
                </Button>
              </Link>
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
          <p>&copy; 2025 EzSign. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
