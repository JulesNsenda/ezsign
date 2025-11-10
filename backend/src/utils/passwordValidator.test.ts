import { validatePassword, isSamePassword } from './passwordValidator';

describe('passwordValidator', () => {
  describe('validatePassword', () => {
    it('should return valid for password meeting all requirements', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password with less than 8 characters', () => {
      const result = validatePassword('Pass1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePassword('password123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePassword('PASSWORD123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePassword('Password');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should return multiple errors for password failing multiple requirements', () => {
      const result = validatePassword('pass');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should reject null/undefined password', () => {
      const result = validatePassword(null as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should accept password with special characters', () => {
      const result = validatePassword('Pass@word123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password exactly 8 characters', () => {
      const result = validatePassword('Pass1234');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with spaces', () => {
      const result = validatePassword('Pass word 123');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept very long password', () => {
      const result = validatePassword('VeryLongPassword123456789012345678901234567890');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with multiple uppercase and numbers', () => {
      const result = validatePassword('PASSword123456');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('isSamePassword', () => {
    it('should return true for identical passwords', () => {
      expect(isSamePassword('Password123', 'Password123')).toBe(true);
    });

    it('should return false for different passwords', () => {
      expect(isSamePassword('Password123', 'DifferentPass456')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isSamePassword('Password123', 'password123')).toBe(false);
    });

    it('should return true for empty strings', () => {
      expect(isSamePassword('', '')).toBe(true);
    });

    it('should return false when one is empty', () => {
      expect(isSamePassword('Password123', '')).toBe(false);
    });

    it('should handle special characters correctly', () => {
      expect(isSamePassword('Pass@123!', 'Pass@123!')).toBe(true);
      expect(isSamePassword('Pass@123!', 'Pass#123!')).toBe(false);
    });
  });
});
