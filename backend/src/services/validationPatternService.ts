/**
 * Validation Pattern Service
 *
 * Provides preset validation patterns for text and textarea fields.
 * Includes regex patterns, input masks, examples, and descriptions.
 */

import { ValidationPatternPreset, ValidationConfig, Field } from '@/models/Field';

/**
 * Complete information about a validation pattern preset
 */
export interface ValidationPatternInfo {
  id: ValidationPatternPreset;
  name: string;
  description: string;
  regex: string;
  mask?: string;           // Input mask format (# = digit, A = letter, * = any)
  example: string;
  category: 'contact' | 'identity' | 'location' | 'format' | 'general';
}

/**
 * All available validation pattern presets
 */
export const VALIDATION_PATTERNS: Record<ValidationPatternPreset, ValidationPatternInfo> = {
  email: {
    id: 'email',
    name: 'Email Address',
    description: 'Standard email address format',
    regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    example: 'user@example.com',
    category: 'contact',
  },
  phone_us: {
    id: 'phone_us',
    name: 'US Phone Number',
    description: 'US phone number with optional formatting',
    regex: '^\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$',
    mask: '(###) ###-####',
    example: '(555) 123-4567',
    category: 'contact',
  },
  phone_intl: {
    id: 'phone_intl',
    name: 'International Phone',
    description: 'International phone number with country code',
    regex: '^\\+?[1-9]\\d{1,14}$',
    mask: '+## ### ### ####',
    example: '+1 555 123 4567',
    category: 'contact',
  },
  sa_id: {
    id: 'sa_id',
    name: 'South African ID',
    description: '13-digit South African ID number',
    regex: '^[0-9]{13}$',
    mask: '#############',
    example: '8001015009087',
    category: 'identity',
  },
  ssn: {
    id: 'ssn',
    name: 'US Social Security Number',
    description: 'US SSN in XXX-XX-XXXX format',
    regex: '^(?!000|666|9\\d{2})\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}$',
    mask: '###-##-####',
    example: '123-45-6789',
    category: 'identity',
  },
  zip_us: {
    id: 'zip_us',
    name: 'US ZIP Code',
    description: '5-digit or 9-digit ZIP code',
    regex: '^\\d{5}(-\\d{4})?$',
    mask: '#####-####',
    example: '12345 or 12345-6789',
    category: 'location',
  },
  postal_ca: {
    id: 'postal_ca',
    name: 'Canadian Postal Code',
    description: 'Canadian postal code (A1B 2C3 format)',
    regex: '^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$',
    mask: 'A#A #A#',
    example: 'K1A 0B1',
    category: 'location',
  },
  postal_uk: {
    id: 'postal_uk',
    name: 'UK Postal Code',
    description: 'UK postcode format',
    regex: '^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$',
    example: 'SW1A 1AA',
    category: 'location',
  },
  number: {
    id: 'number',
    name: 'Number',
    description: 'Numeric values only (including decimals)',
    regex: '^-?\\d*\\.?\\d+$',
    example: '123.45',
    category: 'format',
  },
  alpha: {
    id: 'alpha',
    name: 'Letters Only',
    description: 'Alphabetic characters and spaces only',
    regex: '^[a-zA-Z\\s]+$',
    example: 'John Doe',
    category: 'format',
  },
  alphanumeric: {
    id: 'alphanumeric',
    name: 'Alphanumeric',
    description: 'Letters, numbers, and spaces only',
    regex: '^[a-zA-Z0-9\\s]+$',
    example: 'ABC 123',
    category: 'format',
  },
  url: {
    id: 'url',
    name: 'URL',
    description: 'Web URL format',
    regex: '^(https?:\\/\\/)?([\\da-z.-]+)\\.([a-z.]{2,6})([\\/\\w .-]*)*\\/?$',
    example: 'https://example.com',
    category: 'format',
  },
  date_iso: {
    id: 'date_iso',
    name: 'Date (ISO)',
    description: 'Date in YYYY-MM-DD format',
    regex: '^\\d{4}-\\d{2}-\\d{2}$',
    mask: '####-##-##',
    example: '2024-01-29',
    category: 'format',
  },
  currency: {
    id: 'currency',
    name: 'Currency',
    description: 'Currency amount with optional $ and commas',
    regex: '^-?\\$?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$',
    example: '$1,234.56',
    category: 'format',
  },
  custom: {
    id: 'custom',
    name: 'Custom Pattern',
    description: 'Define your own regex pattern',
    regex: '.*',
    example: 'Your custom format',
    category: 'general',
  },
};

/**
 * Validation Pattern Service
 */
export const validationPatternService = {
  /**
   * Get all available validation patterns
   */
  getAllPatterns(): ValidationPatternInfo[] {
    return Object.values(VALIDATION_PATTERNS);
  },

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: ValidationPatternInfo['category']): ValidationPatternInfo[] {
    return Object.values(VALIDATION_PATTERNS).filter((p) => p.category === category);
  },

  /**
   * Get a specific pattern by ID
   */
  getPattern(id: ValidationPatternPreset): ValidationPatternInfo | undefined {
    return VALIDATION_PATTERNS[id];
  },

  /**
   * Validate a value against a pattern preset
   */
  validateValue(
    value: string,
    patternId: ValidationPatternPreset,
    customRegex?: string
  ): { valid: boolean; message?: string } {
    if (!value) {
      return { valid: true }; // Empty values handled by required check
    }

    let regex: RegExp;

    if (patternId === 'custom') {
      if (!customRegex) {
        return { valid: true }; // No custom regex defined
      }
      try {
        regex = new RegExp(customRegex);
      } catch {
        return { valid: false, message: 'Invalid custom pattern configuration' };
      }
    } else {
      const pattern = VALIDATION_PATTERNS[patternId];
      if (!pattern) {
        return { valid: true }; // Unknown pattern, skip validation
      }
      regex = new RegExp(pattern.regex);
    }

    if (!regex.test(value)) {
      const pattern = VALIDATION_PATTERNS[patternId];
      return {
        valid: false,
        message: pattern
          ? `Please enter a valid ${pattern.name.toLowerCase()}`
          : 'Invalid format',
      };
    }

    return { valid: true };
  },

  /**
   * Validate a field value using the field's validation config
   */
  validateFieldValue(field: Field, value: string): { valid: boolean; message?: string } {
    return field.validateValue(value);
  },

  /**
   * Get input mask for a pattern
   */
  getMask(patternId: ValidationPatternPreset): string | undefined {
    return VALIDATION_PATTERNS[patternId]?.mask;
  },

  /**
   * Get example value for a pattern
   */
  getExample(patternId: ValidationPatternPreset): string | undefined {
    return VALIDATION_PATTERNS[patternId]?.example;
  },

  /**
   * Check if a custom regex is valid
   */
  isValidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Build a validation config from preset
   */
  buildValidationConfig(
    patternId: ValidationPatternPreset,
    customMessage?: string,
    customRegex?: string
  ): ValidationConfig {
    const config: ValidationConfig = {
      pattern: patternId,
    };

    if (customMessage) {
      config.message = customMessage;
    }

    if (patternId === 'custom' && customRegex) {
      config.customRegex = customRegex;
    }

    const pattern = VALIDATION_PATTERNS[patternId];
    if (pattern?.mask) {
      config.mask = pattern.mask;
    }

    return config;
  },

  /**
   * Validate South African ID number with checksum
   * SA IDs have a check digit calculated using the Luhn algorithm
   */
  validateSouthAfricanId(idNumber: string): {
    valid: boolean;
    message?: string;
    details?: {
      birthDate?: string;
      gender?: 'male' | 'female';
      citizenship?: 'citizen' | 'resident';
    };
  } {
    // Basic format check
    if (!/^\d{13}$/.test(idNumber)) {
      return { valid: false, message: 'South African ID must be 13 digits' };
    }

    // Extract components
    const year = parseInt(idNumber.substring(0, 2), 10);
    const month = parseInt(idNumber.substring(2, 4), 10);
    const day = parseInt(idNumber.substring(4, 6), 10);
    const genderDigits = parseInt(idNumber.substring(6, 10), 10);
    const citizenship = parseInt(idNumber.substring(10, 11), 10);
    const checkDigit = parseInt(idNumber.substring(12, 13), 10);

    // Validate month
    if (month < 1 || month > 12) {
      return { valid: false, message: 'Invalid month in ID number' };
    }

    // Validate day (basic check)
    if (day < 1 || day > 31) {
      return { valid: false, message: 'Invalid day in ID number' };
    }

    // Validate citizenship digit
    if (citizenship !== 0 && citizenship !== 1) {
      return { valid: false, message: 'Invalid citizenship digit in ID number' };
    }

    // Luhn algorithm check
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      let digit = parseInt(idNumber.charAt(i), 10);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
    }
    const calculatedCheck = (10 - (sum % 10)) % 10;

    if (calculatedCheck !== checkDigit) {
      return { valid: false, message: 'Invalid ID number (checksum failed)' };
    }

    // Determine full year
    const currentYear = new Date().getFullYear();
    const century = year > (currentYear % 100) ? 1900 : 2000;
    const fullYear = century + year;

    return {
      valid: true,
      details: {
        birthDate: `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        gender: genderDigits >= 5000 ? 'male' : 'female',
        citizenship: citizenship === 0 ? 'citizen' : 'resident',
      },
    };
  },
};
