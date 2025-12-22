import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { logger } from './loggerService';

/**
 * TOTP Service
 * Handles TOTP secret generation, QR code creation, and code verification
 */

const APP_NAME = 'EzSign';

interface GeneratedSecret {
  secret: string;
  otpauthUrl: string;
  manualEntryKey: string;
}

interface BackupCode {
  code: string;
  hash: string;
}

export const totpService = {
  /**
   * Generate a new TOTP secret for a user
   */
  generateSecret(email: string): GeneratedSecret {
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${email})`,
      issuer: APP_NAME,
      length: 32,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new Error('Failed to generate TOTP secret');
    }

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      manualEntryKey: this.formatManualEntryKey(secret.base32),
    };
  },

  /**
   * Format the secret for manual entry (groups of 4 characters)
   */
  formatManualEntryKey(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  },

  /**
   * Generate a QR code data URL from an otpauth URL
   */
  async generateQRCode(otpauthUrl: string): Promise<string> {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 256,
        margin: 2,
      });
      return qrCodeDataUrl;
    } catch (error) {
      logger.error('Failed to generate QR code', { error: (error as Error).message });
      throw new Error('Failed to generate QR code');
    }
  },

  /**
   * Verify a TOTP code against a secret
   * Allows for a 30-second window on either side
   */
  verifyCode(secret: string, code: string): boolean {
    try {
      const isValid = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1, // Allow 1 step (30 seconds) on either side
      });
      return isValid;
    } catch (error) {
      logger.error('TOTP verification error', { error: (error as Error).message });
      return false;
    }
  },

  /**
   * Generate a set of backup codes
   */
  generateBackupCodes(count: number = 10): BackupCode[] {
    const codes: BackupCode[] = [];

    for (let i = 0; i < count; i++) {
      // Generate an 8-character alphanumeric code
      const code = this.generateRandomCode(8);
      const hash = this.hashBackupCode(code);
      codes.push({ code, hash });
    }

    return codes;
  },

  /**
   * Generate a random alphanumeric code
   */
  generateRandomCode(length: number): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded O, 0, 1, I for clarity
    let code = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      const byte = randomBytes[i];
      if (byte !== undefined) {
        code += charset[byte % charset.length];
      }
    }

    // Format as XXXX-XXXX for readability
    if (length === 8) {
      return `${code.slice(0, 4)}-${code.slice(4)}`;
    }

    return code;
  },

  /**
   * Hash a backup code using SHA-256
   */
  hashBackupCode(code: string): string {
    // Remove formatting (dashes, spaces) before hashing
    const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();
    return crypto.createHash('sha256').update(normalizedCode).digest('hex');
  },

  /**
   * Verify a backup code against a hash
   */
  verifyBackupCode(code: string, hash: string): boolean {
    const codeHash = this.hashBackupCode(code);
    return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
  },
};

export default totpService;
