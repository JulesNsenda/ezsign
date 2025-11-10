/* eslint-disable @typescript-eslint/no-unused-vars */
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

export type UserRole = 'admin' | 'creator' | 'signer';

export interface UserData {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  password_reset_token: string | null;
  password_reset_expires: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  email?: string;
  role?: UserRole;
  email_verified?: boolean;
}

export class User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  password_reset_token: string | null;
  password_reset_expires: Date | null;
  created_at: Date;
  updated_at: Date;

  constructor(data: UserData) {
    this.id = data.id;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.role = data.role;
    this.email_verified = data.email_verified;
    this.email_verification_token = data.email_verification_token;
    this.email_verification_expires = data.email_verification_expires;
    this.password_reset_token = data.password_reset_token;
    this.password_reset_expires = data.password_reset_expires;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Hash a plain text password using Argon2
   */
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify this user's password
   */
  async verifyPassword(password: string): Promise<boolean> {
    return User.verifyPassword(this.password_hash, password);
  }

  /**
   * Generate a secure random token
   */
  static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate email verification token with expiry
   */
  generateEmailVerificationToken(): {
    token: string;
    expires: Date;
  } {
    const token = User.generateToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hours

    this.email_verification_token = token;
    this.email_verification_expires = expires;

    return { token, expires };
  }

  /**
   * Verify email verification token
   */
  verifyEmailToken(token: string): boolean {
    if (!this.email_verification_token || !this.email_verification_expires) {
      return false;
    }

    if (this.email_verification_token !== token) {
      return false;
    }

    if (new Date() > this.email_verification_expires) {
      return false;
    }

    return true;
  }

  /**
   * Mark email as verified and clear token
   */
  markEmailVerified(): void {
    this.email_verified = true;
    this.email_verification_token = null;
    this.email_verification_expires = null;
  }

  /**
   * Generate password reset token with expiry
   */
  generatePasswordResetToken(): {
    token: string;
    expires: Date;
  } {
    const token = User.generateToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour

    this.password_reset_token = token;
    this.password_reset_expires = expires;

    return { token, expires };
  }

  /**
   * Verify password reset token
   */
  verifyPasswordResetToken(token: string): boolean {
    if (!this.password_reset_token || !this.password_reset_expires) {
      return false;
    }

    if (this.password_reset_token !== token) {
      return false;
    }

    if (new Date() > this.password_reset_expires) {
      return false;
    }

    return true;
  }

  /**
   * Update password and clear reset token
   */
  async updatePassword(newPassword: string): Promise<void> {
    this.password_hash = await User.hashPassword(newPassword);
    this.password_reset_token = null;
    this.password_reset_expires = null;
  }

  /**
   * Convert to JSON (exclude sensitive fields)
   */
  toJSON(): Omit<UserData, 'password_hash' | 'email_verification_token' | 'password_reset_token'> {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      email_verified: this.email_verified,
      email_verification_expires: this.email_verification_expires,
      password_reset_expires: this.password_reset_expires,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Check if user has admin role
   */
  isAdmin(): boolean {
    return this.role === 'admin';
  }

  /**
   * Check if user has creator role or higher
   */
  isCreator(): boolean {
    return this.role === 'admin' || this.role === 'creator';
  }
}
