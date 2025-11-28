import { Request, Response } from 'express';
import { Pool } from 'pg';
import { UserService } from '@/services/userService';
import { EmailService } from '@/services/emailService';
import { tokenService } from '@/services/tokenService';
import logger from '@/services/loggerService';

export class AuthController {
  private userService: UserService;
  private emailService: EmailService | null;

  constructor(pool: Pool, emailService?: EmailService) {
    this.userService = new UserService(pool);
    this.emailService = emailService || null;
  }

  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, role } = req.body;

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
        return;
      }

      // Validate password length
      if (password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      // Validate role if provided
      if (role && !['admin', 'creator', 'signer'].includes(role)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid role. Must be admin, creator, or signer',
        });
        return;
      }

      // Check if email already exists
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Email already registered',
        });
        return;
      }

      // Create user
      const user = await this.userService.createUser({
        email,
        password,
        role: role || 'creator',
      });

      // Generate email verification token
      const { token, expires } = user.generateEmailVerificationToken();
      await this.userService.updateEmailVerificationToken(
        user.id,
        token,
        expires
      );

      // Send verification email
      if (this.emailService) {
        try {
          await this.emailService.sendEmailVerification({
            recipientEmail: user.email,
            recipientName: user.email.split('@')[0] || user.email, // Use email prefix as name
            verificationToken: token,
          });
        } catch (emailError) {
          logger.warn('Failed to send verification email', { error: (emailError as Error).message, email, correlationId: req.correlationId });
          // Don't fail registration if email fails
        }
      }

      // In development, also return the token for testing
      const verificationInfo =
        process.env.NODE_ENV === 'development'
          ? { verification_token: token }
          : {};

      // Generate tokens
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: user.toJSON(),
        ...tokens,
        ...verificationInfo,
      });
    } catch (error) {
      logger.error('Registration error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register user',
      });
    }
  };

  /**
   * Verify email with token
   * POST /api/auth/verify-email
   */
  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;

      // Validate input
      if (!token) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Verification token is required',
        });
        return;
      }

      // Find user by verification token
      const query = `
        SELECT id, email, password_hash, role, email_verified,
               email_verification_token, email_verification_expires,
               password_reset_token, password_reset_expires,
               created_at, updated_at
        FROM users
        WHERE email_verification_token = $1
      `;

      const result = await this.userService['pool'].query(query, [token]);

      if (result.rows.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid verification token',
        });
        return;
      }

      const userData = result.rows[0];

      // Check if token has expired
      if (
        !userData.email_verification_expires ||
        new Date() > new Date(userData.email_verification_expires)
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Verification token has expired',
        });
        return;
      }

      // Check if email is already verified
      if (userData.email_verified) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email is already verified',
        });
        return;
      }

      // Mark email as verified
      await this.userService.markEmailVerified(userData.id);

      res.status(200).json({
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error('Email verification error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify email',
      });
    }
  };

  /**
   * Login user
   * POST /api/auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Find user by email
      const user = await this.userService.findByEmail(email);

      if (!user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);

      if (!isValidPassword) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
        return;
      }

      // Generate tokens
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(200).json({
        message: 'Login successful',
        user: user.toJSON(),
        ...tokens,
      });
    } catch (error) {
      logger.error('Login error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to login',
      });
    }
  };

  /**
   * Logout user
   * POST /api/auth/logout
   *
   * Note: With JWT, logout is primarily handled on the client side by removing tokens.
   * This endpoint is provided for consistency and can be extended with token blacklisting
   * in the future if needed (using Redis to store invalidated tokens).
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      // In a stateless JWT system, logout is handled client-side
      // The client should delete the access and refresh tokens

      // Optional: If implementing token blacklisting, add the token to a blacklist here
      // const token = tokenService.extractTokenFromHeader(req.headers.authorization);
      // if (token) {
      //   await redisClient.set(`blacklist:${token}`, '1', 'EX', tokenExpiry);
      // }

      res.status(200).json({
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error('Logout error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to logout',
      });
    }
  };

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      // Validate input
      if (!email) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email is required',
        });
        return;
      }

      // Find user by email
      const user = await this.userService.findByEmail(email);

      // Always return success even if user doesn't exist (security best practice)
      // This prevents user enumeration attacks
      if (!user) {
        res.status(200).json({
          message: 'If the email exists, a password reset link has been sent',
        });
        return;
      }

      // Generate password reset token
      const { token, expires } = user.generatePasswordResetToken();
      await this.userService.updatePasswordResetToken(user.id, token, expires);

      // TODO: Send password reset email (will be implemented in email service task)
      // For now, just return the token in development
      const resetInfo =
        process.env.NODE_ENV === 'development'
          ? { reset_token: token }
          : {};

      res.status(200).json({
        message: 'If the email exists, a password reset link has been sent',
        ...resetInfo,
      });
    } catch (error) {
      logger.error('Forgot password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process password reset request',
      });
    }
  };

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body;

      // Validate input
      if (!token || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Token and new password are required',
        });
        return;
      }

      // Validate password length
      if (password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      // Find user by reset token
      const query = `
        SELECT id, email, password_hash, role, email_verified,
               email_verification_token, email_verification_expires,
               password_reset_token, password_reset_expires,
               created_at, updated_at
        FROM users
        WHERE password_reset_token = $1
      `;

      const result = await this.userService['pool'].query(query, [token]);

      if (result.rows.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid or expired reset token',
        });
        return;
      }

      const userData = result.rows[0];

      // Check if token has expired
      if (
        !userData.password_reset_expires ||
        new Date() > new Date(userData.password_reset_expires)
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reset token has expired',
        });
        return;
      }

      // Update password
      await this.userService.updatePassword(userData.id, password);

      res.status(200).json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.error('Reset password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset password',
      });
    }
  };

  /**
   * Refresh access token using refresh token
   * POST /api/auth/refresh
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      // Validate input
      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
        return;
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = tokenService.verifyRefreshToken(refreshToken);
      } catch (error) {
        res.status(401).json({
          error: 'Unauthorized',
          message: error instanceof Error ? error.message : 'Invalid refresh token',
        });
        return;
      }

      // Verify user still exists
      const user = await this.userService.findById(decoded.userId);

      if (!user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found',
        });
        return;
      }

      // Generate new access token
      const accessToken = tokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(200).json({
        message: 'Token refreshed successfully',
        accessToken,
      });
    } catch (error) {
      logger.error('Token refresh error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to refresh token',
      });
    }
  };

  /**
   * Get current authenticated user
   * GET /api/auth/me
   * Requires authentication
   */
  me = async (req: Request, res: Response): Promise<void> => {
    try {
      // User is attached to request by authenticate middleware
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Fetch user from database
      const user = await this.userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        user: user.toJSON(),
      });
    } catch (error) {
      logger.error('Get current user error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get current user',
      });
    }
  };

  /**
   * Change password for authenticated user
   * POST /api/auth/change-password
   * Requires authentication
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = (req as any).user?.userId;

      // Validate authentication
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Validate input - check required fields
      if (!currentPassword || !newPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Current password and new password are required',
        });
        return;
      }

      // Get user from database with password hash
      const user = await this.userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      // Verify current password
      const isValidPassword = await user.verifyPassword(currentPassword);

      if (!isValidPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Current password is incorrect',
        });
        return;
      }

      // Validate new password meets requirements
      const { validatePassword, isSamePassword } = await import('@/utils/passwordValidator');
      const validationResult = validatePassword(newPassword);

      if (!validationResult.valid) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'New password does not meet requirements',
          errors: validationResult.errors,
        });
        return;
      }

      // Check new password is different from current password
      if (isSamePassword(currentPassword, newPassword)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'New password must be different from current password',
        });
        return;
      }

      // Update password in database
      await this.userService.updatePassword(userId, newPassword);

      // Generate new access and refresh tokens
      const tokens = tokenService.generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      // TODO: Queue email notification (background job)
      // This will be implemented in task 4.0

      // TODO: Log audit event
      // This will be implemented when audit service is available

      res.status(200).json({
        message: 'Password changed successfully',
        ...tokens,
      });
    } catch (error) {
      logger.error('Change password error', { error: (error as Error).message, stack: (error as Error).stack, correlationId: req.correlationId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to change password',
      });
    }
  };
}
