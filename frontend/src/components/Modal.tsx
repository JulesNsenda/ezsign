import React, { useEffect } from 'react';

/**
 * Professional modal component with smooth animations
 */

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
  closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = '500px',
  closeOnBackdrop = true,
}) => {
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      style={{ zIndex: 50000 }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-base-100 rounded-xl shadow-2xl w-full max-h-[90vh] overflow-hidden animate-slide-up"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 bg-base-100">
            <h2 className="text-xl font-semibold text-neutral">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-200 transition-all duration-200"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
