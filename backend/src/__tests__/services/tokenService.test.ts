import * as jwt from 'jsonwebtoken';
import { TokenService } from '@/services/tokenService';
import { UserRole } from '@/models/User';

describe('TokenService', () => {
  let tokenService: TokenService;
  const mockJwtSecret = 'test-jwt-secret';
  const mockJwtRefreshSecret = 'test-jwt-refresh-secret';

  beforeAll(() => {
    process.env.JWT_SECRET = mockJwtSecret;
    process.env.JWT_REFRESH_SECRET = mockJwtRefreshSecret;
    process.env.JWT_ACCESS_TOKEN_EXPIRY = '15m';
    process.env.JWT_REFRESH_TOKEN_EXPIRY = '7d';
  });

  beforeEach(() => {
    tokenService = new TokenService();
  });

  describe('constructor', () => {
    it('should throw error if JWT_SECRET is not set', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => new TokenService()).toThrow(
        'JWT_SECRET environment variable is required'
      );

      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, mockJwtSecret) as any;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.iss).toBe('ezsign');
      expect(decoded.aud).toBe('ezsign-api');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, mockJwtRefreshSecret) as any;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.iss).toBe('ezsign');
      expect(decoded.aud).toBe('ezsign-api');
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const tokens = tokenService.generateTokenPair(payload);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateAccessToken(payload);
      const decoded = tokenService.verifyAccessToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => tokenService.verifyAccessToken('invalid-token')).toThrow(
        'Invalid access token'
      );
    });

    it('should throw error for expired token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const expiredToken = jwt.sign(payload, mockJwtSecret, {
        expiresIn: '0s',
        issuer: 'ezsign',
        audience: 'ezsign-api',
      });

      // Wait a moment to ensure token is expired
      setTimeout(() => {
        expect(() => tokenService.verifyAccessToken(expiredToken)).toThrow(
          'Access token has expired'
        );
      }, 100);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateRefreshToken(payload);
      const decoded = tokenService.verifyRefreshToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => tokenService.verifyRefreshToken('invalid-token')).toThrow(
        'Invalid refresh token'
      );
    });
  });

  describe('decodeToken', () => {
    it('should decode a token without verifying', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateAccessToken(payload);
      const decoded = tokenService.decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.role).toBe(payload.role);
    });

    it('should return null for invalid token', () => {
      const decoded = tokenService.decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const token = tokenService.generateAccessToken(payload);
      const isExpired = tokenService.isTokenExpired(token);

      expect(isExpired).toBe(false);
    });

    it('should return true for expired token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const expiredToken = jwt.sign(payload, mockJwtSecret, {
        expiresIn: '0s',
      });

      // Wait a moment to ensure token is expired
      setTimeout(() => {
        const isExpired = tokenService.isTokenExpired(expiredToken);
        expect(isExpired).toBe(true);
      }, 100);
    });

    it('should return true for invalid token', () => {
      const isExpired = tokenService.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'valid-token-string';
      const authHeader = `Bearer ${token}`;

      const extracted = tokenService.extractTokenFromHeader(authHeader);

      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = tokenService.extractTokenFromHeader(undefined);
      expect(extracted).toBeNull();
    });

    it('should return null for invalid format', () => {
      const extracted = tokenService.extractTokenFromHeader('InvalidFormat token');
      expect(extracted).toBeNull();
    });

    it('should return null for header without token', () => {
      const extracted = tokenService.extractTokenFromHeader('Bearer');
      expect(extracted).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new access token from valid refresh token', () => {
      const payload = {
        userId: '123',
        email: 'test@example.com',
        role: 'creator' as UserRole,
      };

      const refreshToken = tokenService.generateRefreshToken(payload);
      const newAccessToken = tokenService.refreshAccessToken(refreshToken);

      expect(newAccessToken).toBeDefined();
      expect(typeof newAccessToken).toBe('string');

      const decoded = tokenService.verifyAccessToken(newAccessToken);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => tokenService.refreshAccessToken('invalid-token')).toThrow();
    });
  });

  describe('getAccessTokenExpiry', () => {
    it('should return access token expiry in seconds', () => {
      const expiry = tokenService.getAccessTokenExpiry();
      expect(expiry).toBe(900); // 15 minutes = 900 seconds
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('should return refresh token expiry in seconds', () => {
      const expiry = tokenService.getRefreshTokenExpiry();
      expect(expiry).toBe(604800); // 7 days = 604800 seconds
    });
  });

  describe('parseExpiry', () => {
    it('should parse seconds correctly', () => {
      const expiry = (tokenService as any).parseExpiry('30s');
      expect(expiry).toBe(30);
    });

    it('should parse minutes correctly', () => {
      const expiry = (tokenService as any).parseExpiry('15m');
      expect(expiry).toBe(900);
    });

    it('should parse hours correctly', () => {
      const expiry = (tokenService as any).parseExpiry('2h');
      expect(expiry).toBe(7200);
    });

    it('should parse days correctly', () => {
      const expiry = (tokenService as any).parseExpiry('7d');
      expect(expiry).toBe(604800);
    });

    it('should return default for invalid format', () => {
      const expiry = (tokenService as any).parseExpiry('invalid');
      expect(expiry).toBe(900); // default 15 minutes
    });
  });
});
