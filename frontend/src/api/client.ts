import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

/**
 * Axios client configuration with interceptors
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/**
 * Request interceptor - attach JWT token to requests
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handle token refresh
 */
/**
 * Endpoints where a 401 is a legitimate ANSWER to the caller - wrong password,
 * wrong 2FA code, expired reset link - rather than an expired session.
 *
 * The interceptor below reacts to a 401 by clearing tokens and hard-navigating
 * to /login. On these endpoints that is actively harmful: submitting a wrong
 * password on the login page produced a 401, which reloaded the page, which
 * remounted the form and destroyed the error message it was about to render -
 * so the user saw their input cleared and NO explanation at all.
 *
 * `/auth/change-password` is deliberately NOT here: it answers a wrong current
 * password with 400, so a 401 from it really does mean the session expired.
 */
const AUTH_ANSWER_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-2fa',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
];

const isAuthAnswerEndpoint = (url?: string): boolean =>
  !!url && AUTH_ANSWER_ENDPOINTS.some((endpoint) => url.startsWith(endpoint));

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthAnswerEndpoint(originalRequest?.url)
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');

        if (!refreshToken) {
          // No refresh token, redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        // Attempt to refresh token
        const response = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken: refreshToken,
        });

        const { accessToken } = response.data;

        // Store new access token
        localStorage.setItem('access_token', accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
