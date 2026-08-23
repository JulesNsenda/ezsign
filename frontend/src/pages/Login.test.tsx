import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './Login';
import { useAuth } from '@/hooks/useAuth';
import { useDefaultBranding } from '@/hooks/useBranding';

/**
 * Regression tests for form-level validation feedback.
 *
 * The bug: the <form> relied on NATIVE browser validation (the email input is
 * type="email" and there was no noValidate). The browser blocked submit and
 * showed its own unstyled bubble, so react-hook-form's zod resolver never ran
 * and the app's OWN error markup - which carries role="alert" and
 * aria-describedby - was dead code for the invalid-email case. Caught by the
 * Playwright spec "should show validation error for invalid email" running
 * against the live deploy.
 */

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useBranding', () => ({ useDefaultBranding: vi.fn() }));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockUseDefaultBranding = useDefaultBranding as unknown as ReturnType<typeof vi.fn>;

const renderLogin = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Login - validation feedback', () => {
  const loginMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ login: loginMock });
    mockUseDefaultBranding.mockReturnValue({
      data: { branding: null, isDefault: true, registrationEnabled: false },
      isLoading: false,
      isError: false,
    });
  });

  it('renders the app-styled "Invalid email address" error rather than deferring to the browser', async () => {
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email address/i)).toBeInTheDocument();
    // Native validation would have blocked submit before the resolver ran.
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('sets noValidate so the browser cannot pre-empt the zod resolver', () => {
    const { container } = renderLogin();

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('novalidate');
  });

  it('surfaces the required-password error through the app markup', async () => {
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'real@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('submits when the input is valid', async () => {
    loginMock.mockResolvedValue({ user: { must_change_password: false } });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'real@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
  });
});
