import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Documents from './Documents';

// Mock the auth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', email: 'test@example.com', role: 'user' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}));

// Mock the hooks
vi.mock('@/hooks/useDocuments', () => ({
  useDocuments: vi.fn(() => ({
    data: {
      documents: [
        {
          id: '1',
          title: 'Test Document',
          status: 'draft',
          page_count: 5,
          file_size: 1024000,
          original_filename: 'test.pdf',
          workflow_type: 'single',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        total_pages: 1,
      },
    },
    isLoading: false,
    refetch: vi.fn(),
  })),
  useDeleteDocument: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDownloadDocument: vi.fn(() => ({
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>,
  );
};

describe('Documents Page', () => {
  it('should render documents page with title', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
  });

  it('should render upload button', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('Upload Document')).toBeInTheDocument();
  });

  it('should render search input', () => {
    renderWithProviders(<Documents />);
    const searchInput = screen.getByPlaceholderText('Search documents by title...');
    expect(searchInput).toBeInTheDocument();
  });

  it('should render status filter dropdown', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('All Statuses')).toBeInTheDocument();
  });

  it('should render document in table', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('Test Document')).toBeInTheDocument();
  });

  it('should filter documents when typing in search', () => {
    renderWithProviders(<Documents />);
    const searchInput = screen.getByPlaceholderText(
      'Search documents by title...',
    ) as HTMLInputElement;

    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(searchInput.value).toBe('Test');
    expect(screen.getByText('Test Document')).toBeInTheDocument();
  });

  it('should show clear filters button when filters are active', () => {
    renderWithProviders(<Documents />);
    const searchInput = screen.getByPlaceholderText('Search documents by title...');

    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});
