import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Templates from './Templates';

// Mock the auth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', email: 'test@example.com', role: 'user' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}));

// Mock the template hooks
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: vi.fn(() => ({
    data: {
      items: [
        {
          id: '1',
          name: 'Test Template',
          description: 'A test template',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        total_pages: 1,
      },
    },
    isLoading: false,
    refetch: vi.fn(),
  })),
  useDeleteTemplate: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useCreateDocumentFromTemplate: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
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

describe('Templates Page', () => {
  it('should render templates page with title', () => {
    renderWithProviders(<Templates />);
    expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
  });

  it('should render template card with name', () => {
    renderWithProviders(<Templates />);
    expect(screen.getByText('Test Template')).toBeInTheDocument();
  });

  it('should render template description', () => {
    renderWithProviders(<Templates />);
    expect(screen.getByText('A test template')).toBeInTheDocument();
  });

  it('should render use template button', () => {
    renderWithProviders(<Templates />);
    expect(screen.getByText('Use Template')).toBeInTheDocument();
  });

  it('should render delete button', () => {
    renderWithProviders(<Templates />);
    // Delete button is icon-only with danger variant
    const buttons = screen.getAllByRole('button');
    const deleteButton = buttons.find(btn => btn.className.includes('bg-error'));
    expect(deleteButton).toBeDefined();
  });
});
