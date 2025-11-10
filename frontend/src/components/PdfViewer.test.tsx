import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PdfViewer from './PdfViewer';

// Mock react-pdf
vi.mock('react-pdf', () => ({
  Document: ({ children }: any) => {
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: any) => (
    <div data-testid={`pdf-page-${pageNumber}`}>Page {pageNumber}</div>
  ),
  pdfjs: {
    version: '3.0.0',
    GlobalWorkerOptions: {},
  },
}));

describe('PdfViewer Component', () => {
  it('should render PDF viewer', () => {
    render(<PdfViewer fileUrl="test.pdf" />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('should render current page', () => {
    render(<PdfViewer fileUrl="test.pdf" currentPage={1} />);
    expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument();
  });

  it('should accept width prop', () => {
    render(<PdfViewer fileUrl="test.pdf" width={600} />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('should render with custom file URL', () => {
    render(<PdfViewer fileUrl="custom-file.pdf" />);
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });
});
