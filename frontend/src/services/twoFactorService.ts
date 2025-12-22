import apiClient from '@/api/client';

/**
 * Two-Factor Authentication Service
 * Handles all 2FA-related API calls
 */

export interface TwoFactorSetupResult {
  qrCodeDataUrl: string;
  manualEntryKey: string;
}

export interface TwoFactorStatus {
  isEnabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

export interface TwoFactorVerifyResult {
  verified: boolean;
}

export const twoFactorService = {
  /**
   * Initialize 2FA setup - generates QR code and secret
   */
  async initSetup(): Promise<TwoFactorSetupResult> {
    const response = await apiClient.post<{ success: boolean; data: TwoFactorSetupResult }>('/auth/2fa/setup');
    return response.data.data;
  },

  /**
   * Complete 2FA setup by verifying the code from authenticator app
   */
  async completeSetup(code: string): Promise<string[]> {
    const response = await apiClient.post<{ success: boolean; data: { message: string; backupCodes: string[] } }>(
      '/auth/2fa/verify-setup',
      { code }
    );
    return response.data.data.backupCodes;
  },

  /**
   * Disable 2FA
   */
  async disable(code: string): Promise<void> {
    await apiClient.delete('/auth/2fa', { data: { code } });
  },

  /**
   * Get 2FA status for current user
   */
  async getStatus(): Promise<TwoFactorStatus> {
    const response = await apiClient.get<{ success: boolean; data: TwoFactorStatus }>('/auth/2fa/status');
    return response.data.data;
  },

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(code: string): Promise<string[]> {
    const response = await apiClient.post<{ success: boolean; data: { message: string; backupCodes: string[] } }>(
      '/auth/2fa/backup-codes',
      { code }
    );
    return response.data.data.backupCodes;
  },

  /**
   * Verify 2FA code during login
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const response = await apiClient.post<{ success: boolean; data: { verified: boolean } }>(
      '/auth/2fa/verify',
      { userId, code }
    );
    return response.data.data.verified;
  },

  /**
   * Verify backup code during login
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const response = await apiClient.post<{ success: boolean; data: { verified: boolean } }>(
      '/auth/2fa/verify-backup',
      { userId, code }
    );
    return response.data.data.verified;
  },
};

export default twoFactorService;
