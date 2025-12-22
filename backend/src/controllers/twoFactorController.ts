import { Request, Response, NextFunction } from 'express';
import { TwoFactorService } from '@/services/twoFactorService';
import { logger } from '@/services/loggerService';

/**
 * Two-Factor Authentication Controller
 * Handles 2FA setup, verification, and management endpoints
 */

export const createTwoFactorController = (twoFactorService: TwoFactorService) => {
  return {
    /**
     * Initialize 2FA setup
     * POST /api/auth/2fa/setup
     */
    setupInit: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.userId;
        const email = req.user?.email;

        if (!userId || !email) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const result = await twoFactorService.initSetup(userId, email);

        return res.status(200).json({
          success: true,
          data: {
            qrCodeDataUrl: result.qrCodeDataUrl,
            manualEntryKey: result.manualEntryKey,
          },
        });
      } catch (error) {
        logger.error('2FA setup init error', {
          error: (error as Error).message,
          userId: req.user?.userId,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('already enabled')) {
          return res.status(400).json({
            success: false,
            error: { code: 'ALREADY_ENABLED', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },

    /**
     * Complete 2FA setup by verifying code
     * POST /api/auth/2fa/verify-setup
     */
    setupComplete: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.userId;
        const { code } = req.body;

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        if (!code || typeof code !== 'string' || code.length !== 6) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Please provide a 6-digit verification code' },
          });
        }

        const backupCodes = await twoFactorService.completeSetup(userId, code);

        return res.status(200).json({
          success: true,
          data: {
            message: 'Two-factor authentication enabled successfully',
            backupCodes,
          },
        });
      } catch (error) {
        logger.error('2FA setup complete error', {
          error: (error as Error).message,
          userId: req.user?.userId,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('Invalid verification code')) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },

    /**
     * Disable 2FA
     * DELETE /api/auth/2fa
     */
    disable: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.userId;
        const { code } = req.body;

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        if (!code || typeof code !== 'string' || code.length !== 6) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Please provide a 6-digit verification code' },
          });
        }

        await twoFactorService.disable(userId, code);

        return res.status(200).json({
          success: true,
          data: {
            message: 'Two-factor authentication disabled successfully',
          },
        });
      } catch (error) {
        logger.error('2FA disable error', {
          error: (error as Error).message,
          userId: req.user?.userId,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('Invalid verification code')) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },

    /**
     * Get 2FA status
     * GET /api/auth/2fa/status
     */
    getStatus: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const status = await twoFactorService.getStatus(userId);

        return res.status(200).json({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error('2FA status error', {
          error: (error as Error).message,
          userId: req.user?.userId,
          correlationId: req.correlationId,
        });
        return next(error);
      }
    },

    /**
     * Regenerate backup codes
     * POST /api/auth/2fa/backup-codes
     */
    regenerateBackupCodes: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.userId;
        const { code } = req.body;

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        if (!code || typeof code !== 'string' || code.length !== 6) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Please provide a 6-digit verification code' },
          });
        }

        const backupCodes = await twoFactorService.regenerateBackupCodes(userId, code);

        return res.status(200).json({
          success: true,
          data: {
            message: 'Backup codes regenerated successfully',
            backupCodes,
          },
        });
      } catch (error) {
        logger.error('2FA regenerate backup codes error', {
          error: (error as Error).message,
          userId: req.user?.userId,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('Invalid verification code')) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CODE', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },

    /**
     * Verify 2FA code during login
     * POST /api/auth/2fa/verify
     */
    verify: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId, code } = req.body;

        if (!userId || !code) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'User ID and code are required' },
          });
        }

        const isValid = await twoFactorService.verify(userId, code);

        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
          });
        }

        return res.status(200).json({
          success: true,
          data: {
            verified: true,
          },
        });
      } catch (error) {
        logger.error('2FA verify error', {
          error: (error as Error).message,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('locked')) {
          return res.status(429).json({
            success: false,
            error: { code: 'ACCOUNT_LOCKED', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },

    /**
     * Verify backup code during login
     * POST /api/auth/2fa/verify-backup
     */
    verifyBackup: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId, code } = req.body;

        if (!userId || !code) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'User ID and code are required' },
          });
        }

        const isValid = await twoFactorService.verifyBackupCode(userId, code);

        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_CODE', message: 'Invalid backup code' },
          });
        }

        return res.status(200).json({
          success: true,
          data: {
            verified: true,
          },
        });
      } catch (error) {
        logger.error('2FA verify backup error', {
          error: (error as Error).message,
          correlationId: req.correlationId,
        });

        if ((error as Error).message.includes('locked')) {
          return res.status(429).json({
            success: false,
            error: { code: 'ACCOUNT_LOCKED', message: (error as Error).message },
          });
        }

        return next(error);
      }
    },
  };
};

export default createTwoFactorController;
