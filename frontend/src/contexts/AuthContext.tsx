import React, { createContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '@/types';
import authService, { type LoginData, type RegisterData } from '@/services/authService';

/**
 * Authentication context
 * Provides authentication state and methods to the entire application
 */

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<void>;
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
   */
  const login = async (data: LoginData): Promise<void> => {
    const response = await authService.login(data);
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
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
