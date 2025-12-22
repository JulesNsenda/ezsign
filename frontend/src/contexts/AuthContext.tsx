import React, { createContext, useState, useEffect, type ReactNode } from 'react';
import type { User, AuthResponse } from '@/types';
import authService, { type LoginData, type RegisterData, type TwoFactorLoginData } from '@/services/authService';

/**
 * Authentication context
 * Provides authentication state and methods to the entire application
 */

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<AuthResponse>;
  verify2fa: (data: TwoFactorLoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Load user on mount if authenticated
   */
  useEffect(() => {
    const loadUser = async () => {
      if (authService.isAuthenticated()) {
        try {
          const currentUser = await authService.getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          console.error('Failed to load user:', error);
          // Token might be invalid, clear it
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  /**
   * Login user
   * Returns the response so caller can check if 2FA is required
   */
  const login = async (data: LoginData): Promise<AuthResponse> => {
    const response = await authService.login(data);
    // Only set user if 2FA is not required
    if (!response.twoFactorRequired && response.user) {
      setUser(response.user);
    }
    return response;
  };

  /**
   * Complete 2FA verification
   */
  const verify2fa = async (data: TwoFactorLoginData): Promise<void> => {
    const response = await authService.verify2fa(data);
    setUser(response.user);
  };

  /**
   * Register new user
   */
  const register = async (data: RegisterData): Promise<void> => {
    const response = await authService.register(data);
    setUser(response.user);
  };

  /**
   * Logout user
   */
  const logout = async (): Promise<void> => {
    await authService.logout();
    setUser(null);
  };

  /**
   * Refresh user data
   */
  const refreshUser = async (): Promise<void> => {
    if (authService.isAuthenticated()) {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    verify2fa,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
