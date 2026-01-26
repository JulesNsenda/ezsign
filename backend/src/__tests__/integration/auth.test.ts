import { Pool } from 'pg';
import { AuthController } from '@/controllers/authController';
import { tokenService } from '@/services/tokenService';
import { User } from '@/models/User';

// Mock tokenBlacklistService to avoid Redis connections in tests
jest.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    blacklistToken: jest.fn().mockResolvedValue(undefined),
    isBlacklisted: jest.fn().mockResolvedValue(false),
    blacklistAllUserTokens: jest.fn().mockResolvedValue(undefined),
    isUserSessionRevoked: jest.fn().mockResolvedValue(false),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock TwoFactorService to avoid database calls
jest.mock('@/services/twoFactorService', () => {
  return {
    TwoFactorService: jest.fn().mockImplementation(() => {
      return {
        isEnabled: jest.fn().mockResolvedValue(false),
        getStatus: jest.fn().mockResolvedValue({ enabled: false }),
        setup: jest.fn(),
        verify: jest.fn().mockResolvedValue(true),
        verifyBackupCode: jest.fn().mockResolvedValue(true),
      };
    }),
  };
});

/**
 * Integration tests for authentication flow
 * These tests verify the complete authentication workflow
 * Note: These tests use mocked database connections
 * In a real environment, you would use a test database
 */

describe('Authentication Integration Tests', () => {
  let pool: Pool;
  let authController: AuthController;
  let mockRequest: any;
  let mockResponse: any;

  beforeAll(() => {
    // Setup mock pool
    pool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as any;
  });

  beforeEach(() => {
    authController = new AuthController(pool);

    // Mock the twoFactorService instance to avoid database calls
    (authController as any).twoFactorService = {
      isEnabled: jest.fn().mockResolvedValue(false),
      getStatus: jest.fn().mockResolvedValue({ enabled: false }),
      setup: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
      verifyBackupCode: jest.fn().mockResolvedValue(true),
    };

    // Setup request/response mocks
    mockRequest = {
      body: {},
      headers: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('Complete Registration Flow', () => {
    it('should successfully register a new user and return tokens', async () => {
      const userData = {
        email: 'integration@example.com',
        password: 'SecurePassword123!',
      };

      mockRequest.body = userData;

      // Mock database responses
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // findByEmail returns no user
        .mockResolvedValueOnce({
          // createUser returns new user
          rows: [
            {
              id: 'user-123',
              email: userData.email,
              password_hash: 'hashed-password',
              role: 'creator',
              email_verified: false,
              email_verification_token: null,
              email_verification_expires: null,
              password_reset_token: null,
              password_reset_expires: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // updateEmailVerificationToken

      await authController.register(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully',
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            id: 'user-123',
            email: userData.email,
            role: 'creator',
          }),
        })
      );
    });
  });

  describe('Complete Login Flow', () => {
    it('should successfully login and return tokens', async () => {
      const credentials = {
        email: 'integration@example.com',
        password: 'SecurePassword123!',
      };

      mockRequest.body = credentials;

      const hashedPassword = await User.hashPassword(credentials.password);

      // Mock database response for findByEmail
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: credentials.email,
            password_hash: hashedPassword,
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.login(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            id: 'user-123',
            email: credentials.email,
          }),
        })
      );
    });
  });

  describe('Token Refresh Flow', () => {
    it('should successfully refresh access token', async () => {
      const payload = {
        userId: 'user-123',
        email: 'integration@example.com',
        role: 'creator' as const,
      };

      // Generate a valid refresh token
      const refreshToken = tokenService.generateRefreshToken(payload);

      mockRequest.body = { refreshToken };

      // Mock finding user
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: payload.userId,
            email: payload.email,
            password_hash: 'hashed-password',
            role: payload.role,
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.refresh(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token refreshed successfully',
          accessToken: expect.any(String),
        })
      );

      // Verify the new access token is valid
      const response = mockResponse.json.mock.calls[0][0];
      const decoded = tokenService.verifyAccessToken(response.accessToken);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });
  });

  describe('Email Verification Flow', () => {
    it('should verify email with valid token', async () => {
      const verificationToken = 'valid-verification-token';
      mockRequest.body = { token: verificationToken };

      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      // Mock finding user by token
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-123',
              email: 'integration@example.com',
              password_hash: 'hashed-password',
              role: 'creator',
              email_verified: false,
              email_verification_token: verificationToken,
              email_verification_expires: futureDate,
              password_reset_token: null,
              password_reset_expires: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // markEmailVerified

      await authController.verifyEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Email verified successfully',
      });
    });

    it('should reject expired verification token', async () => {
      const verificationToken = 'expired-token';
      mockRequest.body = { token: verificationToken };

      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      // Mock finding user by token
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'integration@example.com',
            password_hash: 'hashed-password',
            role: 'creator',
            email_verified: false,
            email_verification_token: verificationToken,
            email_verification_expires: pastDate,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.verifyEmail(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Verification token has expired',
      });
    });
  });

  describe('Password Reset Flow', () => {
    it('should complete password reset flow successfully', async () => {
      const email = 'integration@example.com';
      const resetToken = 'reset-token-123';
      const newPassword = 'NewSecurePassword123!';

      // Step 1: Request password reset
      mockRequest.body = { email };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email,
            password_hash: 'old-hashed-password',
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({}); // updatePasswordResetToken

      await authController.forgotPassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'If the email exists, a password reset link has been sent',
        })
      );

      // Step 2: Reset password with token
      mockRequest.body = { token: resetToken, password: newPassword };

      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-123',
              email,
              password_hash: 'old-hashed-password',
              role: 'creator',
              email_verified: true,
              email_verification_token: null,
              email_verification_expires: null,
              password_reset_token: resetToken,
              password_reset_expires: futureDate,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // updatePassword

      await authController.resetPassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Password reset successfully',
      });
    });
  });

  describe('Authentication Error Handling', () => {
    it('should handle duplicate email registration', async () => {
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'SecurePassword123!',
      };

      // Mock finding existing user
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'existing-user' }],
      });

      await authController.register(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Email already registered',
      });
    });

    it('should handle invalid credentials on login', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        password: 'WrongPassword',
      };

      const correctPassword = await User.hashPassword('CorrectPassword');

      // Mock finding user
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'user@example.com',
            password_hash: correctPassword,
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.login(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    });
  });

  describe('Change Password Flow', () => {
    it('should complete change password flow successfully', async () => {
      const userId = 'user-123';
      const currentPassword = 'CurrentPassword123';
      const newPassword = 'NewPassword456';
      const email = 'integration@example.com';

      mockRequest.body = {
        currentPassword,
        newPassword,
      };
      (mockRequest as any).user = { userId };

      const hashedCurrentPassword = await User.hashPassword(currentPassword);

      // Mock finding user with current password
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: userId,
              email,
              password_hash: hashedCurrentPassword,
              role: 'creator',
              email_verified: true,
              email_verification_token: null,
              email_verification_expires: null,
              password_reset_token: null,
              password_reset_expires: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({}); // updatePassword

      await authController.changePassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Password changed successfully',
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        })
      );

      // Verify new tokens are valid
      const response = mockResponse.json.mock.calls[0][0];
      const decoded = tokenService.verifyAccessToken(response.accessToken);
      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
    });

    it('should reject password change with incorrect current password', async () => {
      const userId = 'user-123';
      const currentPassword = 'WrongPassword123';
      const newPassword = 'NewPassword456';

      mockRequest.body = {
        currentPassword,
        newPassword,
      };
      (mockRequest as any).user = { userId };

      const hashedCorrectPassword = await User.hashPassword('CorrectPassword123');

      // Mock finding user with different password
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: userId,
            email: 'integration@example.com',
            password_hash: hashedCorrectPassword,
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.changePassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Current password is incorrect',
      });
    });

    it('should reject weak new password', async () => {
      const userId = 'user-123';
      const currentPassword = 'CurrentPassword123';
      const weakPassword = 'weak'; // Too short, no uppercase, no number

      mockRequest.body = {
        currentPassword,
        newPassword: weakPassword,
      };
      (mockRequest as any).user = { userId };

      const hashedCurrentPassword = await User.hashPassword(currentPassword);

      // Mock finding user
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: userId,
            email: 'integration@example.com',
            password_hash: hashedCurrentPassword,
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.changePassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'New password does not meet requirements',
        errors: expect.arrayContaining([
          'Password must be at least 8 characters long',
          'Password must contain at least one uppercase letter',
          'Password must contain at least one number',
        ]),
      });
    });

    it('should reject same password as current', async () => {
      const userId = 'user-123';
      const password = 'SamePassword123';

      mockRequest.body = {
        currentPassword: password,
        newPassword: password,
      };
      (mockRequest as any).user = { userId };

      const hashedPassword = await User.hashPassword(password);

      // Mock finding user
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: userId,
            email: 'integration@example.com',
            password_hash: hashedPassword,
            role: 'creator',
            email_verified: true,
            email_verification_token: null,
            email_verification_expires: null,
            password_reset_token: null,
            password_reset_expires: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await authController.changePassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'New password must be different from current password',
      });
    });

    it('should reject unauthenticated password change request', async () => {
      mockRequest.body = {
        currentPassword: 'CurrentPassword123',
        newPassword: 'NewPassword456',
      };
      // No user in request (not authenticated)

      await authController.changePassword(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });
  });
});
