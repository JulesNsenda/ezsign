import React from 'react';
import Button from './Button';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

/**
 * Fallback UI displayed when an error is caught by ErrorBoundary
 */
export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError }) => {
  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  const errorId = Date.now().toString(36).toUpperCase();
  const isDevelopment = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-md w-full bg-base-100 rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-base-content mb-2">
          Something went wrong
        </h1>

        <p className="text-base-content/70 mb-6">
          We're sorry, but something unexpected happened. Please try again or contact support if the problem persists.
        </p>

        {isDevelopment && (
          <div className="mb-6 p-4 bg-error/10 rounded-md text-left">
            <p className="text-sm font-medium text-error mb-1">Error Details:</p>
            <p className="text-sm text-error/90 font-mono break-all">
              {error.message}
            </p>
            {error.stack && (
              <details className="mt-2">
                <summary className="text-sm text-error/80 cursor-pointer hover:underline">
                  Stack trace
                </summary>
                <pre className="mt-2 text-xs text-error/70 overflow-auto max-h-40 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="primary"
            onClick={resetError}
          >
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={handleGoHome}
          >
            Go to Home
          </Button>
          <Button
            variant="ghost"
            onClick={handleReload}
          >
            Reload Page
          </Button>
        </div>

        <p className="mt-6 text-sm text-base-content/50">
          Error ID: {errorId}
        </p>
      </div>
    </div>
  );
};

export default ErrorFallback;
