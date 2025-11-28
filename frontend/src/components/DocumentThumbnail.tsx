import React, { useState } from 'react';

interface DocumentThumbnailProps {
  documentId: string;
  title: string;
  hasThumbnail?: boolean;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Document thumbnail component with loading state and fallback
 */
export const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  documentId,
  title,
  hasThumbnail = false,
  className = '',
  width = 80,
  height = 104,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const thumbnailUrl = `${baseUrl}/api/documents/${documentId}/thumbnail`;

  // Show placeholder if no thumbnail or error loading
  const showPlaceholder = !hasThumbnail || imageError;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-base-200 flex items-center justify-center ${className}`}
      style={{ width, height }}
    >
      {showPlaceholder ? (
        // PDF placeholder icon
        <div className="flex flex-col items-center justify-center text-base-content/40">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 3v6h6"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6M9 17h4"
            />
          </svg>
          <span className="text-[10px] mt-1 font-medium">PDF</span>
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-200">
              <span className="loading loading-spinner loading-sm text-base-content/40"></span>
            </div>
          )}
          <img
            src={thumbnailUrl}
            alt={`Thumbnail for ${title}`}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setImageError(true);
              setIsLoading(false);
            }}
          />
        </>
      )}
    </div>
  );
};

export default DocumentThumbnail;
