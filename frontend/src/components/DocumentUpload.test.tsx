import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentUpload from './DocumentUpload';

// Mock the hooks
vi.mock('@/hooks/useDocuments', () => ({
  useUploadDocument: vi.fn(() => ({
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
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
};

describe('DocumentUpload Component', () => {
  it('should render title input', () => {
    renderWithProviders(<DocumentUpload />);
    expect(screen.getByPlaceholderText('Enter document title')).toBeInTheDocument();
  });

  it('should render file upload area', () => {
    renderWithProviders(<DocumentUpload />);
    expect(screen.getByText('Click to upload')).toBeInTheDocument();
  });

  it('should render PDF file restriction message', () => {
    renderWithProviders(<DocumentUpload />);
    expect(screen.getByText(/PDF files only/i)).toBeInTheDocument();
  });

  it('should render upload button', () => {
    renderWithProviders(<DocumentUpload />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('should disable upload button when no file selected', () => {
    renderWithProviders(<DocumentUpload />);
    const uploadButton = screen.getByText('Upload');
    expect(uploadButton).toBeDisabled();
  });

  it('should allow typing in title field', () => {
    renderWithProviders(<DocumentUpload />);
    const titleInput = screen.getByPlaceholderText(
      'Enter document title'
    ) as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: 'My Document' } });
    expect(titleInput.value).toBe('My Document');
  });

  it('should render cancel button when onCancel prop is provided', () => {
    const onCancel = vi.fn();
    renderWithProviders(<DocumentUpload onCancel={onCancel} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    renderWithProviders(<DocumentUpload onCancel={onCancel} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
