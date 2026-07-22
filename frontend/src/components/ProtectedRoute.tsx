import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Protected route component
 * Redirects to login if user is not authenticated
 */

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Force a password change before allowing access to any other protected
  // route. Guard against redirecting to itself to avoid a navigation loop.
  if (user?.must_change_password && location.pathname !== '/change-password-required') {
    return <Navigate to="/change-password-required" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
