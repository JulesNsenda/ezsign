import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { UserRole } from '@/models/User';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface DecodedToken extends JwtPayload {
  jti: string;
  iat: number;
  exp: number;
}

export class TokenService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || this.jwtSecret;
    this.accessTokenExpiry = process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Generate a unique JWT ID (jti)
   */
  private generateJti(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate an access token
   */
  generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(
      { ...payload, jti: this.generateJti() },
      this.jwtSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: 'ezsign',
        audience: 'ezsign-api',
      }
    );
  }

  /**
   * Generate a refresh token
   */
  generateRefreshToken(payload: JwtPayload): string {
    return jwt.sign(
      { ...payload, jti: this.generateJti() },
      this.jwtRefreshSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'ezsign',
        audience: 'ezsign-api',
      }
    );
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(payload: JwtPayload): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): DecodedToken {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'ezsign',
        audience: 'ezsign-api',
      }) as DecodedToken;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw error;
    }
  }

  /**
   * Verify and decode a refresh token
   */
  verifyRefreshToken(token: string): DecodedToken {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: 'ezsign',
        audience: 'ezsign-api',
      }) as DecodedToken;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Decode a token without verifying (use with caution)
   */
  decodeToken(token: string): DecodedToken | null {
    try {
      return jwt.decode(token) as DecodedToken;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a token is expired without verifying signature
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Extract token from Authorization header
   * Expected format: "Bearer <token>"
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1] || null;
  }

  /**
   * Refresh an access token using a refresh token
   */
  refreshAccessToken(refreshToken: string): string {
    const decoded = this.verifyRefreshToken(refreshToken);

    // Create a new access token with the same payload
    const payload: JwtPayload = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    return this.generateAccessToken(payload);
  }

  /**
   * Get token expiry time in seconds
   */
  getAccessTokenExpiry(): number {
    return this.parseExpiry(this.accessTokenExpiry);
  }

  /**
   * Get refresh token expiry time in seconds
   */
  getRefreshTokenExpiry(): number {
    return this.parseExpiry(this.refreshTokenExpiry);
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}

// Export a singleton instance
export const tokenService = new TokenService();
