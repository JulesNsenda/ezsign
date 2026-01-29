import apiClient from '@/api/client';
import type {
  ValidationPatternPreset,
  ValidationPatternInfo,
  ValidationConfig,
} from '@/types';

/**
 * Validation Pattern Service
 * Handles fetching and client-side validation of field values
 */

// Cache for validation patterns
let patternsCache: ValidationPatternInfo[] | null = null;
let patternsByCategoryCache: Record<string, ValidationPatternInfo[]> | null = null;

export const validationService = {
  /**
   * Get all available validation patterns
   */
  async getPatterns(): Promise<{
    patterns: ValidationPatternInfo[];
    byCategory: Record<string, ValidationPatternInfo[]>;
  }> {
    // Return cached if available
    if (patternsCache && patternsByCategoryCache) {
      return {
        patterns: patternsCache,
        byCategory: patternsByCategoryCache,
      };
    }

    const response = await apiClient.get<{
      patterns: ValidationPatternInfo[];
      byCategory: Record<string, ValidationPatternInfo[]>;
    }>('/util/validation-patterns');

    patternsCache = response.data.patterns;
    patternsByCategoryCache = response.data.byCategory;

    return response.data;
  },

  /**
   * Get a specific pattern by ID
   */
  async getPattern(id: ValidationPatternPreset): Promise<ValidationPatternInfo | undefined> {
    const { patterns } = await this.getPatterns();
    return patterns.find((p) => p.id === id);
  },

  /**
   * Validate a custom regex pattern
   */
  async validateRegex(pattern: string): Promise<{ valid: boolean; message: string }> {
    const response = await apiClient.post<{ valid: boolean; message: string }>(
      '/util/validate-regex',
      { pattern }
    );
    return response.data;
  },

  /**
   * Test a value against a validation pattern (server-side)
   */
  async testValidation(
    value: string,
    patternId: ValidationPatternPreset,
    customRegex?: string
  ): Promise<{ valid: boolean; message?: string }> {
    const response = await apiClient.post<{ valid: boolean; message?: string }>(
      '/util/test-validation',
      { value, patternId, customRegex }
    );
    return response.data;
  },

  /**
   * Client-side validation (faster, no network)
   * Returns { valid: true } or { valid: false, message: string }
   */
  validateValueLocally(
    value: string,
    config: ValidationConfig | undefined
  ): { valid: boolean; message?: string } {
    // No validation config
    if (!config || !config.pattern) {
      return { valid: true };
    }

    // Empty values pass (required check is separate)
    if (!value || value.trim() === '') {
      return { valid: true };
    }

    let regex: RegExp;

    if (config.pattern === 'custom') {
      if (!config.customRegex) {
        return { valid: true }; // No custom regex defined
      }
      try {
        regex = new RegExp(config.customRegex);
      } catch {
        return { valid: false, message: 'Invalid custom pattern configuration' };
      }
    } else {
      const patternRegex = PATTERN_REGEXES[config.pattern];
      if (!patternRegex) {
        return { valid: true }; // Unknown pattern
      }
      regex = patternRegex;
    }

    if (!regex.test(value)) {
      const message = config.message || DEFAULT_MESSAGES[config.pattern] || 'Invalid format';
      return { valid: false, message };
    }

    return { valid: true };
  },

  /**
   * Get input mask for a pattern
   */
  getMask(patternId?: ValidationPatternPreset): string | undefined {
    if (!patternId) return undefined;
    return PATTERN_MASKS[patternId];
  },

  /**
   * Get example value for a pattern
   */
  getExample(patternId?: ValidationPatternPreset): string | undefined {
    if (!patternId) return undefined;
    return PATTERN_EXAMPLES[patternId];
  },

  /**
   * Clear cached patterns (for refresh)
   */
  clearCache(): void {
    patternsCache = null;
    patternsByCategoryCache = null;
  },
};

/**
 * Client-side regex patterns (mirrors backend)
 */
const PATTERN_REGEXES: Record<ValidationPatternPreset, RegExp> = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone_us: /^\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
  phone_intl: /^\+?[1-9]\d{1,14}$/,
  sa_id: /^[0-9]{13}$/,
  ssn: /^(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}$/,
  zip_us: /^\d{5}(-\d{4})?$/,
  postal_ca: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  postal_uk: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
  number: /^-?\d*\.?\d+$/,
  alpha: /^[a-zA-Z\s]+$/,
  alphanumeric: /^[a-zA-Z0-9\s]+$/,
  url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
  date_iso: /^\d{4}-\d{2}-\d{2}$/,
  currency: /^-?\$?\d{1,3}(,\d{3})*(\.\d{2})?$/,
  custom: /.*/,
};

/**
 * Default validation error messages
 */
const DEFAULT_MESSAGES: Record<ValidationPatternPreset, string> = {
  email: 'Please enter a valid email address',
  phone_us: 'Please enter a valid US phone number (e.g., (555) 123-4567)',
  phone_intl: 'Please enter a valid international phone number',
  sa_id: 'Please enter a valid 13-digit South African ID number',
  ssn: 'Please enter a valid Social Security Number (e.g., 123-45-6789)',
  zip_us: 'Please enter a valid ZIP code (e.g., 12345 or 12345-6789)',
  postal_ca: 'Please enter a valid Canadian postal code (e.g., A1B 2C3)',
  postal_uk: 'Please enter a valid UK postal code',
  number: 'Please enter a valid number',
  alpha: 'Please enter letters only',
  alphanumeric: 'Please enter letters and numbers only',
  url: 'Please enter a valid URL',
  date_iso: 'Please enter a date in YYYY-MM-DD format',
  currency: 'Please enter a valid currency amount',
  custom: 'Invalid format',
};

/**
 * Input masks for patterns
 */
const PATTERN_MASKS: Partial<Record<ValidationPatternPreset, string>> = {
  phone_us: '(###) ###-####',
  phone_intl: '+## ### ### ####',
  sa_id: '#############',
  ssn: '###-##-####',
  zip_us: '#####-####',
  postal_ca: 'A#A #A#',
  date_iso: '####-##-##',
};

/**
 * Example values for patterns
 */
const PATTERN_EXAMPLES: Record<ValidationPatternPreset, string> = {
  email: 'user@example.com',
  phone_us: '(555) 123-4567',
  phone_intl: '+1 555 123 4567',
  sa_id: '8001015009087',
  ssn: '123-45-6789',
  zip_us: '12345',
  postal_ca: 'K1A 0B1',
  postal_uk: 'SW1A 1AA',
  number: '123.45',
  alpha: 'John Doe',
  alphanumeric: 'ABC 123',
  url: 'https://example.com',
  date_iso: '2024-01-29',
  currency: '$1,234.56',
  custom: 'Your custom format',
};

export default validationService;
