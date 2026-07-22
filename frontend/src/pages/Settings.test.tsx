import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from './Settings';

// Mock the auth hook - role is varied per test via mockReturnValueOnce.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock ThemeContext
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  })),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Team hooks - Settings.tsx calls useTeams() unconditionally on mount.
vi.mock('@/hooks/useTeams', () => ({
  useTeams: vi.fn(() => ({ data: [], isLoading: false })),
  useTeamMembers: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateTeam: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateTeam: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteTeam: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateTeamMemberRole: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRemoveTeamMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useInvitations', () => ({
  useTeamInvitations: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateInvitation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCancelInvitation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useResendInvitation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/services/twoFactorService', () => ({
  twoFactorService: {
    getStatus: vi.fn().mockResolvedValue({ enabled: false }),
    disable: vi.fn(),
    regenerateBackupCodes: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Settings Page - Instance tab visibility', () => {
  it('hides the Instance tab for a creator', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: '1', email: 'creator@example.com', role: 'creator', must_change_password: false },
      logout: vi.fn(),
    });

    renderWithProviders(<Settings />);

    expect(screen.queryByText('Instance')).not.toBeInTheDocument();
  });

  it('shows the Instance tab for an admin', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: '2', email: 'admin@example.com', role: 'admin', must_change_password: false },
      logout: vi.fn(),
    });

    renderWithProviders(<Settings />);

    expect(screen.getByText('Instance')).toBeInTheDocument();
  });
});
