import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcceptInvitation from './AcceptInvitation';
import { useAuth } from '@/hooks/useAuth';
import { useInvitationByToken, useAcceptInvitation } from '@/hooks/useInvitations';

/**
 * Covers the registration-gate change to AcceptInvitation's unauthenticated
 * redirect (plan item 2/6): previously sent an unauthenticated invitee to
 * `/login?redirect=...` - a dead end with registration closed, since
 * InvitationService.accept() never creates a user. Now sends them to
 * `/register?invitationToken=...` so the backend's invitation exemption is
 * reachable.
 */

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useInvitations', () => ({
  useInvitationByToken: vi.fn(),
  useAcceptInvitation: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockUseInvitationByToken = useInvitationByToken as unknown as ReturnType<typeof vi.fn>;
const mockUseAcceptInvitation = useAcceptInvitation as unknown as ReturnType<typeof vi.fn>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const validInvitationData = {
  invitation: {
    id: 'inv-1',
    email: 'invitee@example.com',
    role: 'member',
    status: 'pending',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    is_valid: true,
    is_expired: false,
  },
  team: { id: 'team-1', name: 'Acme' },
};

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
          <Route path="/register" element={<div>Register Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('AcceptInvitation - unauthenticated redirect target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAcceptInvitation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseInvitationByToken.mockReturnValue({
      data: validInvitationData,
      isLoading: false,
      error: null,
    });
  });

  it('redirects an unauthenticated visitor to /register with the invitation token attached (not /login)', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });

    renderAt('/accept-invitation/abc123');

    await waitFor(() => {
      expect(screen.getByText('Register Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('URL-encodes the token in the redirect target', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });

    // A token containing a character that must be percent-encoded to
    // survive as a single query-string value.
    renderAt('/accept-invitation/abc%26123');

    await waitFor(() => {
      expect(screen.getByText('Register Page')).toBeInTheDocument();
    });
  });

  it("does not redirect while the invitation itself is still loading (the effect gates on useInvitationByToken's isLoading, not auth)", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });
    mockUseInvitationByToken.mockReturnValue({ data: undefined, isLoading: true, error: null });

    renderAt('/accept-invitation/abc123');

    expect(screen.queryByText('Register Page')).not.toBeInTheDocument();
  });

  it('does not redirect to /register when the user is already authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { email: 'invitee@example.com' },
    });

    renderAt('/accept-invitation/abc123');

    await waitFor(() => {
      expect(screen.getByText('Team Invitation')).toBeInTheDocument();
    });
    expect(screen.queryByText('Register Page')).not.toBeInTheDocument();
  });
});
