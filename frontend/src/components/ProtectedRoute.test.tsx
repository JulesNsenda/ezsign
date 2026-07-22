import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const renderAt = (initialPath: string) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/login"
          element={<div>Login Page</div>}
        />
        <Route
          path="/change-password-required"
          element={
            <ProtectedRoute>
              <div>Force Change Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects an unauthenticated user to /login', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    renderAt('/dashboard');

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children for an authenticated, non-flagged user', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'user@example.com', role: 'creator', must_change_password: false },
      isAuthenticated: true,
      isLoading: false,
    });

    renderAt('/dashboard');

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects a flagged user (must_change_password) to /change-password-required', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@example.com', role: 'admin', must_change_password: true },
      isAuthenticated: true,
      isLoading: false,
    });

    renderAt('/dashboard');

    expect(screen.getByText('Force Change Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('does NOT redirect a flagged user who is already on /change-password-required (loop guard)', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'admin@example.com', role: 'admin', must_change_password: true },
      isAuthenticated: true,
      isLoading: false,
    });

    renderAt('/change-password-required');

    expect(screen.getByText('Force Change Page')).toBeInTheDocument();
  });

  it('shows a loading state while auth status is resolving', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });

    renderAt('/dashboard');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
