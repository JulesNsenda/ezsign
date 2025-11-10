/**
 * Password validation utility
 * Validates password strength according to security requirements
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password meets all security requirements
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @param password - Password to validate
 * @returns Validation result with errors if any
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if two passwords are the same
 *
 * @param password1 - First password
 * @param password2 - Second password
 * @returns True if passwords are identical
 */
export function isSamePassword(password1: string, password2: string): boolean {
  return password1 === password2;
}
