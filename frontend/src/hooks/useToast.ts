import { useContext } from 'react';
import { ToastContext } from '@/contexts/ToastContext';

/**
 * Custom hook to access toast notifications
 *
 * @throws Error if used outside of ToastProvider
 * @returns Toast context
 */
export const useToast = () => {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};

export default useToast;
