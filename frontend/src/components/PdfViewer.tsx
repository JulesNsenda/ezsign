import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Button from './Button';

// Configure worker - use correct unpkg URL format with .mjs extension
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;

/**
 * PDF viewer component with page navigation
 */

export interface PdfViewerProps {
  fileUrl: string;
  onLoadSuccess?: (numPages: number) => void;
  onLoadError?: (error: Error) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  width?: number;
  children?: (pageNumber: number) => React.ReactNode;
}

const PdfViewerComponent: React.FC<PdfViewerProps> = ({
  fileUrl,
  onLoadSuccess,
  onLoadError,
  currentPage: controlledPage,
  onPageChange,
  width = 800,
  children,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [internalPage, setInternalPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentPage = controlledPage ?? internalPage;
  const setCurrentPage = onPageChange ?? setInternalPage;

  const handleLoadSuccess = ({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
    setIsLoading(false);
    setError(null);
    onLoadSuccess?.(pages);
  };

  const handleLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setIsLoading(false);
    setError(error.message || 'Failed to load PDF file');
    onLoadError?.(error);
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Page Navigation */}
      {numPages > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginBottom: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
          >
            ← Previous
          </Button>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>
            Page {currentPage} of {numPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
          >
            Next →
          </Button>
        </div>
      )}

      {/* PDF Document */}
      <div style={{ position: 'relative', backgroundColor: '#e9ecef', padding: '1rem' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '1rem',
              color: '#666',
              zIndex: 10,
            }}
          >
            Loading PDF...
          </div>
        )}
        {error && (
          <div
            style={{
              padding: '2rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              border: '1px solid #f5c6cb',
              minHeight: '200px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>Failed to load PDF</div>
            <div style={{ fontSize: '0.875rem' }}>{error}</div>
            <div style={{ fontSize: '0.75rem', color: '#666' }}>
              Check the browser console for more details
            </div>
          </div>
        )}
        {!error && (
          <Document
            file={fileUrl}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            loading={<div style={{ height: '600px', width: `${width}px` }} />}
          >
            <div style={{ position: 'relative' }}>
              <Page
                pageNumber={currentPage}
                width={width}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
              {children?.(currentPage)}
            </div>
          </Document>
        )}
      </div>

      {/* Page Info */}
      {numPages > 0 && (
        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
          Total pages: {numPages}
        </div>
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
// React.memo's comparison function should return true when props are EQUAL (skip re-render)
// and false when props are DIFFERENT (do re-render)
export const PdfViewer = React.memo(PdfViewerComponent, (prevProps, nextProps) => {
  // Return true if props are the same (skip re-render)
  // We intentionally ignore the 'children' prop because it's always a new function reference
  // but the actual content it renders depends on currentPage which we do check
  const areEqual =
    prevProps.fileUrl === nextProps.fileUrl &&
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.width === nextProps.width;
  return areEqual;
});

export default PdfViewer;
