import apiClient from '@/api/client';
import type { Branding, PublicBranding, UpdateBrandingData } from '@/types';

/**
 * Branding service
 * Handles all team branding-related API calls
 */

export interface BrandingResponse {
  branding: Branding;
  publicBranding: PublicBranding;
}

export interface LogoUploadResponse {
  message: string;
  logoUrl: string;
  branding: Branding;
}

export interface PublicBrandingResponse {
  branding: PublicBranding | null;
  isDefault: boolean;
}

export const brandingService = {
  /**
   * Get branding settings for a team
   */
  async getBranding(teamId: string): Promise<BrandingResponse> {
    const response = await apiClient.get<BrandingResponse>(
      `/teams/${teamId}/branding`
    );
    return response.data;
  },

  /**
   * Update branding settings for a team
   */
  async updateBranding(
    teamId: string,
    data: UpdateBrandingData
  ): Promise<BrandingResponse> {
    const response = await apiClient.put<BrandingResponse & { message: string }>(
      `/teams/${teamId}/branding`,
      data
    );
    return response.data;
  },

  /**
   * Upload a logo for a team
   */
  async uploadLogo(teamId: string, file: File): Promise<LogoUploadResponse> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await apiClient.post<LogoUploadResponse>(
      `/teams/${teamId}/branding/logo`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  /**
   * Delete the logo for a team
   */
  async deleteLogo(teamId: string): Promise<{ message: string; branding: Branding }> {
    const response = await apiClient.delete<{ message: string; branding: Branding }>(
      `/teams/${teamId}/branding/logo`
    );
    return response.data;
  },

  /**
   * Reset branding to defaults
   */
  async resetBranding(teamId: string): Promise<{ message: string; branding: Branding }> {
    const response = await apiClient.post<{ message: string; branding: Branding }>(
      `/teams/${teamId}/branding/reset`
    );
    return response.data;
  },

  /**
   * Get public branding for signing pages (no auth required)
   */
  async getPublicBranding(teamId: string): Promise<PublicBrandingResponse> {
    const response = await apiClient.get<PublicBrandingResponse>(
      `/branding/public/${teamId}`
    );
    return response.data;
  },

  /**
   * Get logo URL for a team
   */
  getLogoUrl(teamId: string): string {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    return `${baseUrl}/api/branding/logo/${teamId}`;
  },

  /**
   * Validate hex color format
   */
  isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  },

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Validate URL format
   */
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
};

export default brandingService;
