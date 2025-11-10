import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

/**
 * Custom hook to access authentication context
 *
 * @throws Error if used outside of AuthProvider
 * @returns Authentication context
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export default useAuth;
