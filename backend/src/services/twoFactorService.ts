import { Pool } from 'pg';
import { totpService } from './totpService';
import { logger } from './loggerService';

/**
 * Two-Factor Authentication Service
 * Handles 2FA setup, verification, and management
 */

const LOCKOUT_THRESHOLD = 5; // Number of failed attempts before lockout
const LOCKOUT_DURATION_MINUTES = 15; // Lockout duration in minutes
const BACKUP_CODE_COUNT = 10; // Number of backup codes to generate

interface TwoFactorSetupResult {
  secret: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
}

interface TwoFactorStatus {
  isEnabled: boolean;
  enabledAt: Date | null;
  backupCodesRemaining: number;
}

export class TwoFactorService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize 2FA setup for a user
   * Generates a new secret and QR code
   */
  async initSetup(userId: string, email: string): Promise<TwoFactorSetupResult> {
    // Check if user already has 2FA enabled
    const existing = await this.getStatus(userId);
    if (existing.isEnabled) {
      throw new Error('Two-factor authentication is already enabled');
    }

    // Generate new TOTP secret
    const { secret, otpauthUrl, manualEntryKey } = totpService.generateSecret(email);

    // Generate QR code
    const qrCodeDataUrl = await totpService.generateQRCode(otpauthUrl);

    // Store the secret (not yet enabled)
    await this.pool.query(
      `INSERT INTO user_2fa (user_id, totp_secret, is_enabled)
       VALUES ($1, $2, false)
       ON CONFLICT (user_id)
       DO UPDATE SET totp_secret = $2, is_enabled = false, updated_at = current_timestamp`,
      [userId, secret]
    );

    logger.info('2FA setup initiated', { userId });

    return {
      secret,
      qrCodeDataUrl,
      manualEntryKey,
    };
  }

  /**
   * Complete 2FA setup by verifying the code
   * Returns backup codes on success
   */
  async completeSetup(userId: string, code: string): Promise<string[]> {
    // Get the pending secret
    const result = await this.pool.query(
      `SELECT totp_secret, is_enabled FROM user_2fa WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('2FA setup not initiated. Please start setup first.');
    }

    const { totp_secret, is_enabled } = result.rows[0];

    if (is_enabled) {
      throw new Error('Two-factor authentication is already enabled');
    }

    // Verify the code
    if (!totpService.verifyCode(totp_secret, code)) {
      throw new Error('Invalid verification code. Please try again.');
    }

    // Generate backup codes
    const backupCodes = totpService.generateBackupCodes(BACKUP_CODE_COUNT);

    // Start transaction to enable 2FA and store backup codes
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Enable 2FA
      await client.query(
        `UPDATE user_2fa
         SET is_enabled = true, enabled_at = current_timestamp, updated_at = current_timestamp
         WHERE user_id = $1`,
        [userId]
      );

      // Delete any existing backup codes
      await client.query(
        `DELETE FROM user_backup_codes WHERE user_id = $1`,
        [userId]
      );

      // Store new backup codes (hashed)
      for (const { hash } of backupCodes) {
        await client.query(
          `INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
          [userId, hash]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info('2FA setup completed', { userId });

    // Return the plain text codes (only time they're shown)
    return backupCodes.map((bc) => bc.code);
  }

  /**
   * Disable 2FA for a user (requires code verification)
   */
  async disable(userId: string, code: string): Promise<void> {
    // Get the secret
    const result = await this.pool.query(
      `SELECT totp_secret, is_enabled FROM user_2fa WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_enabled) {
      throw new Error('Two-factor authentication is not enabled');
    }

    const { totp_secret } = result.rows[0];

    // Verify the code
    if (!totpService.verifyCode(totp_secret, code)) {
      throw new Error('Invalid verification code');
    }

    // Start transaction to disable 2FA and remove backup codes
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete 2FA record
      await client.query(`DELETE FROM user_2fa WHERE user_id = $1`, [userId]);

      // Delete backup codes
      await client.query(`DELETE FROM user_backup_codes WHERE user_id = $1`, [userId]);

      // Delete trusted devices
      await client.query(`DELETE FROM user_trusted_devices WHERE user_id = $1`, [userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info('2FA disabled', { userId });
  }

  /**
   * Verify a TOTP code during login
   */
  async verify(userId: string, code: string): Promise<boolean> {
    // Check if locked out
    if (await this.isLocked(userId)) {
      throw new Error('Account temporarily locked due to too many failed attempts. Please try again later.');
    }

    // Get the secret
    const result = await this.pool.query(
      `SELECT totp_secret, is_enabled FROM user_2fa WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_enabled) {
      throw new Error('Two-factor authentication is not enabled');
    }

    const { totp_secret } = result.rows[0];

    // Verify the code
    const isValid = totpService.verifyCode(totp_secret, code);

    if (isValid) {
      await this.resetFailedAttempts(userId);
      logger.info('2FA verification successful', { userId });
      return true;
    } else {
      await this.recordFailedAttempt(userId);
      logger.warn('2FA verification failed', { userId });
      return false;
    }
  }

  /**
   * Verify a backup code (single use)
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // Check if locked out
    if (await this.isLocked(userId)) {
      throw new Error('Account temporarily locked due to too many failed attempts. Please try again later.');
    }

    const codeHash = totpService.hashBackupCode(code);

    // Find and consume the backup code
    const result = await this.pool.query(
      `UPDATE user_backup_codes
       SET used_at = current_timestamp
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
       RETURNING id`,
      [userId, codeHash]
    );

    if (result.rowCount === 0) {
      await this.recordFailedAttempt(userId);
      logger.warn('Invalid backup code attempt', { userId });
      return false;
    }

    await this.resetFailedAttempts(userId);
    logger.info('Backup code used successfully', { userId });
    return true;
  }

  /**
   * Get 2FA status for a user
   */
  async getStatus(userId: string): Promise<TwoFactorStatus> {
    const result = await this.pool.query(
      `SELECT is_enabled, enabled_at FROM user_2fa WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        isEnabled: false,
        enabledAt: null,
        backupCodesRemaining: 0,
      };
    }

    const { is_enabled, enabled_at } = result.rows[0];

    // Count remaining backup codes
    const backupResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM user_backup_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );

    return {
      isEnabled: is_enabled,
      enabledAt: enabled_at,
      backupCodesRemaining: parseInt(backupResult.rows[0].count, 10),
    };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
    // Verify the user's TOTP code first
    const result = await this.pool.query(
      `SELECT totp_secret, is_enabled FROM user_2fa WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_enabled) {
      throw new Error('Two-factor authentication is not enabled');
    }

    const { totp_secret } = result.rows[0];

    if (!totpService.verifyCode(totp_secret, code)) {
      throw new Error('Invalid verification code');
    }

    // Generate new backup codes
    const backupCodes = totpService.generateBackupCodes(BACKUP_CODE_COUNT);

    // Replace old codes with new ones
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing backup codes
      await client.query(`DELETE FROM user_backup_codes WHERE user_id = $1`, [userId]);

      // Store new backup codes
      for (const { hash } of backupCodes) {
        await client.query(
          `INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
          [userId, hash]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    logger.info('Backup codes regenerated', { userId });

    return backupCodes.map((bc) => bc.code);
  }

  /**
   * Record a failed 2FA attempt
   */
  async recordFailedAttempt(userId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE users
       SET two_fa_failed_attempts = two_fa_failed_attempts + 1
       WHERE id = $1
       RETURNING two_fa_failed_attempts`,
      [userId]
    );

    const attempts = result.rows[0]?.two_fa_failed_attempts || 0;

    // Lock the account if threshold exceeded
    if (attempts >= LOCKOUT_THRESHOLD) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await this.pool.query(
        `UPDATE users SET two_fa_locked_until = $1 WHERE id = $2`,
        [lockUntil, userId]
      );
      logger.warn('Account locked due to failed 2FA attempts', { userId, attempts });
    }
  }

  /**
   * Reset failed attempt counter
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET two_fa_failed_attempts = 0, two_fa_locked_until = NULL WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Check if account is locked
   */
  async isLocked(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT two_fa_locked_until FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const lockUntil = result.rows[0].two_fa_locked_until;

    if (!lockUntil) {
      return false;
    }

    // If lock has expired, clear it
    if (new Date(lockUntil) < new Date()) {
      await this.resetFailedAttempts(userId);
      return false;
    }

    return true;
  }

  /**
   * Check if user has 2FA enabled
   */
  async isEnabled(userId: string): Promise<boolean> {
    const status = await this.getStatus(userId);
    return status.isEnabled;
  }
}

export default TwoFactorService;
