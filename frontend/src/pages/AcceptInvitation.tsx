import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInvitationByToken, useAcceptInvitation } from '@/hooks/useInvitations';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';
import Card from '@/components/Card';

/**
 * Accept Invitation Page
 * Handles the flow when a user clicks an invitation link
 */
export const AcceptInvitation: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: fetchError } = useInvitationByToken(token || null);
  const acceptMutation = useAcceptInvitation();

  const handleAccept = async () => {
    if (!token) return;

    try {
      const result = await acceptMutation.mutateAsync(token);
      navigate('/settings', { state: { activeTab: 'teams', message: `You've joined ${result.team?.name || 'the team'}!` } });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to accept invitation');
    }
  };

  // If not authenticated, redirect to login with return URL
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(`/login?redirect=/accept-invitation/${token}`);
    }
  }, [isLoading, isAuthenticated, navigate, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-neutral/20 border-t-neutral rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-base-content/60">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
        <Card className="max-w-md w-full">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral mb-2">Invitation Not Found</h1>
            <p className="text-base-content/60 mb-6">
              This invitation link is invalid or has expired.
            </p>
            <Link to="/login">
              <Button>Go to Login</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const { invitation, team } = data;

  // Check if invitation is still valid
  if (!invitation.is_valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
        <Card className="max-w-md w-full">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral mb-2">
              {invitation.is_expired ? 'Invitation Expired' : 'Invitation Invalid'}
            </h1>
            <p className="text-base-content/60 mb-6">
              {invitation.is_expired
                ? 'This invitation has expired. Please ask the team admin to send a new invitation.'
                : invitation.status === 'accepted'
                ? 'This invitation has already been accepted.'
                : 'This invitation is no longer valid.'}
            </p>
            <Link to="/settings">
              <Button variant="outline">Go to Settings</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Check if user email matches invitation
  const emailMatches = user?.email?.toLowerCase() === invitation.email.toLowerCase();

  if (!emailMatches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
        <Card className="max-w-md w-full">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral mb-2">Wrong Account</h1>
            <p className="text-base-content/60 mb-2">
              This invitation was sent to <strong>{invitation.email}</strong>
            </p>
            <p className="text-base-content/60 mb-6">
              You're currently logged in as <strong>{user?.email}</strong>
            </p>
            <p className="text-sm text-base-content/50 mb-6">
              Please log in with the correct account to accept this invitation.
            </p>
            <Link to="/login">
              <Button>Switch Account</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <Card className="max-w-md w-full">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-neutral/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral mb-2">Team Invitation</h1>
          <p className="text-base-content/60 mb-6">
            You've been invited to join <strong>{team?.name || 'a team'}</strong> as a <strong>{invitation.role}</strong>.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleAccept}
              loading={acceptMutation.isPending}
              disabled={acceptMutation.isPending}
            >
              Accept Invitation
            </Button>
            <Link to="/settings">
              <Button variant="outline" className="w-full">
                Decline
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AcceptInvitation;
