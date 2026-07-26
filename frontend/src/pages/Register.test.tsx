import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Register from './Register';
import { useAuth } from '@/hooks/useAuth';
import { useDefaultBranding } from '@/hooks/useBranding';

/**
 * Covers the registration gate's render paths (registration-gate plan, item
 * B4/B5): open (form), closed (no form), invited (form despite closed), and
 * the "couldn't check" fetch-failure state, plus the error-envelope fix.
 */

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useBranding', () => ({
  useDefaultBranding: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockUseDefaultBranding = useDefaultBranding as unknown as ReturnType<typeof vi.fn>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Register />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Register - registration gate render paths', () => {
  const registerMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ register: registerMock });
  });

  it('renders the create-account form when registration is open', () => {
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/register');

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign-up is closed' })).not.toBeInTheDocument();
  });

  it('renders a closed state (no form) when registration is closed and there is no invitation token', () => {
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/register');

    expect(screen.getByRole('heading', { name: 'Sign-up is closed' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();

    // A path back to login is preserved even in the closed state.
    const loginLink = screen.getByText('Sign in').closest('a');
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('renders the form for an invited signup even when registration is closed', () => {
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/register?invitationToken=abc123');

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign-up is closed' })).not.toBeInTheDocument();
  });

  it('renders a distinct "couldn\'t check" state on fetch error, without showing the form or the closed state', () => {
    mockUseDefaultBranding.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderAt('/register');

    expect(
      screen.getByRole('heading', { name: "Couldn't check sign-up status" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign-up is closed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('redirects to accept-invitation (not the dashboard) after a successful invited registration', async () => {
    // hasInvitationExemption on the backend only checks the token to let
    // registration through - it does not accept the invitation itself, so
    // the new (now-authenticated) account must land back on
    // accept-invitation to actually join the team.
    registerMock.mockResolvedValue(undefined);
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/register?invitationToken=abc123']}>
          <Routes>
            <Route path="/register" element={<Register />} />
            <Route path="/accept-invitation/:token" element={<div>Accept Invitation Page</div>} />
            <Route path="/" element={<div>Home Page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Someone' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(screen.getByText('Accept Invitation Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });

  it('surfaces the server message when the error envelope has a string `error` field (registration-gate 403 shape)', async () => {
    registerMock.mockRejectedValue({
      response: {
        data: { error: 'Forbidden', message: 'Registration is currently closed' },
      },
    });
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    // invitationToken bypasses the closed state so the form (and thus the
    // submit path) is reachable - mirrors an invited signup whose email
    // doesn't match the invitation and gets rejected by the backend.
    renderAt('/register?invitationToken=abc123');

    // Name is genuinely optional now (see the schema's comment) - filled in
    // here since that's not what this test is about; the blank-name case
    // has its own dedicated test below.
    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Someone' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(screen.getByText('Registration is currently closed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Registration failed. Please try again.')).not.toBeInTheDocument();
  });

  it("submits successfully with the Name field left blank (regression: `.min(1).optional()` used to reject the '' RHF submits for an untouched input, blocking this on the invited-signup path too)", async () => {
    registerMock.mockResolvedValue(undefined);
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    // Closed + invitation token: the exact dead-end this fix exists to
    // clear (an invited signup with the Name field left untouched used to
    // be unsubmittable even though the field is documented as optional).
    renderAt('/register?invitationToken=abc123');

    // Name deliberately left untouched.
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalled();
    });
    // Under the old `.min(1).optional()` schema, react-hook-form's zodResolver
    // blocks submission entirely for the blank input - registerMock would
    // never fire and "Name is required" would render instead.
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });

  it('forwards the invitationToken from the URL through to registerUser (without it the backend exemption is unreachable)', async () => {
    registerMock.mockResolvedValue(undefined);
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/register?invitationToken=abc123');

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'someone@example.com',
          invitationToken: 'abc123',
        }),
      );
    });
  });
});
