import apiClient from '@/api/client';
import type { AuthResponse, User } from '@/types';

/**
 * Authentication service
 * Handles all authentication-related API calls
 */

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export const authService = {
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    const { accessToken, refreshToken } = response.data;

    // Store tokens in localStorage after registration
    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }

    return response.data;
  },

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    const { accessToken, refreshToken } = response.data;

    // Store tokens in localStorage
    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }

    return response.data;
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      // Always clear local storage, even if API call fails
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.data.user;
  },

  /**
   * Request password reset
   */
  async forgotPassword(data: ForgotPasswordData): Promise<void> {
    await apiClient.post('/auth/forgot-password', data);
  },

  /**
   * Reset password with token
   */
  async resetPassword(data: ResetPasswordData): Promise<void> {
    await apiClient.post('/auth/reset-password', data);
  },

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    await apiClient.post('/auth/verify-email', { token });
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },
};

export default authService;
