/**
 * Pre-fill Service
 *
 * Handles template variable parsing for pre-filled field values.
 * Supported variables:
 * - {{signer.name}} - Current signer's name
 * - {{signer.email}} - Current signer's email
 * - {{today}} - Current date in document format
 * - {{today:FORMAT}} - Current date in specified format (e.g., {{today:YYYY-MM-DD}})
 * - {{document.title}} - Document title
 * - {{document.id}} - Document ID
 */

import { Field } from '@/models/Field';

/**
 * Context data for template variable resolution
 */
export interface PrefillContext {
  signer?: {
    name?: string;
    email?: string;
  };
  document?: {
    id?: string;
    title?: string;
  };
}

/**
 * Template variable pattern
 * Matches {{variable}} or {{variable:format}}
 */
const TEMPLATE_VARIABLE_REGEX = /\{\{([^}:]+)(?::([^}]+))?\}\}/g;

/**
 * Format a date according to a format string
 * Supports: YYYY, MM, DD, YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
 */
function formatDate(date: Date, format: string): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  switch (format.toUpperCase()) {
    case 'YYYY':
      return year;
    case 'MM':
      return month;
    case 'DD':
      return day;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    default:
      // Default to YYYY-MM-DD
      return `${year}-${month}-${day}`;
  }
}

/**
 * Resolve a single template variable
 */
function resolveVariable(
  variable: string,
  format: string | undefined,
  context: PrefillContext
): string | null {
  const normalizedVar = variable.trim().toLowerCase();

  switch (normalizedVar) {
    case 'signer.name':
      return context.signer?.name || null;

    case 'signer.email':
      return context.signer?.email || null;

    case 'today':
      return formatDate(new Date(), format || 'YYYY-MM-DD');

    case 'now':
    case 'date':
      return formatDate(new Date(), format || 'YYYY-MM-DD');

    case 'document.title':
      return context.document?.title || null;

    case 'document.id':
      return context.document?.id || null;

    default:
      // Unknown variable, return null
      return null;
  }
}

/**
 * Parse template string and replace variables with values
 *
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context data for variable resolution
 * @returns Resolved string with variables replaced
 */
export function parseTemplate(
  template: string,
  context: PrefillContext
): string {
  if (!template) {
    return template;
  }

  return template.replace(
    TEMPLATE_VARIABLE_REGEX,
    (match, variable, format) => {
      const resolved = resolveVariable(variable, format, context);
      // If variable couldn't be resolved, keep the original placeholder
      return resolved !== null ? resolved : match;
    }
  );
}

/**
 * Check if a string contains template variables
 */
export function hasTemplateVariables(value: string): boolean {
  if (!value) {
    return false;
  }
  return TEMPLATE_VARIABLE_REGEX.test(value);
}

/**
 * Get the pre-filled value for a field
 *
 * @param field - Field to get pre-filled value for
 * @param context - Context data for variable resolution
 * @returns Pre-filled value or undefined if none
 */
export function getPrefilledValue(
  field: Field,
  context: PrefillContext
): string | undefined {
  const defaultValue = field.properties?.defaultValue;

  if (!defaultValue) {
    return undefined;
  }

  return parseTemplate(defaultValue, context);
}

/**
 * Pre-fill multiple fields
 *
 * @param fields - Array of fields to pre-fill
 * @param context - Context data for variable resolution
 * @returns Map of field IDs to their pre-filled values
 */
export function prefillFields(
  fields: Field[],
  context: PrefillContext
): Map<string, string> {
  const prefilled = new Map<string, string>();

  for (const field of fields) {
    const value = getPrefilledValue(field, context);
    if (value !== undefined) {
      prefilled.set(field.id, value);
    }
  }

  return prefilled;
}

/**
 * Get list of available template variables with descriptions
 */
export function getAvailableVariables(): Array<{
  variable: string;
  description: string;
  example: string;
}> {
  return [
    {
      variable: '{{signer.name}}',
      description: 'Current signer\'s name',
      example: 'John Doe',
    },
    {
      variable: '{{signer.email}}',
      description: 'Current signer\'s email address',
      example: 'john@example.com',
    },
    {
      variable: '{{today}}',
      description: 'Current date (YYYY-MM-DD format)',
      example: '2024-01-29',
    },
    {
      variable: '{{today:MM/DD/YYYY}}',
      description: 'Current date in custom format',
      example: '01/29/2024',
    },
    {
      variable: '{{today:DD/MM/YYYY}}',
      description: 'Current date in DD/MM/YYYY format',
      example: '29/01/2024',
    },
    {
      variable: '{{document.title}}',
      description: 'Document title',
      example: 'Contract Agreement',
    },
    {
      variable: '{{document.id}}',
      description: 'Document unique identifier',
      example: '550e8400-e29b-41d4-a716-446655440000',
    },
  ];
}

/**
 * Validate template variables in a default value string
 *
 * @param value - Default value string to validate
 * @returns Validation result with any unrecognized variables
 */
export function validateTemplateVariables(value: string): {
  valid: boolean;
  unrecognized: string[];
} {
  const unrecognized: string[] = [];
  const knownVariables = [
    'signer.name',
    'signer.email',
    'today',
    'now',
    'date',
    'document.title',
    'document.id',
  ];

  const matches = value.matchAll(TEMPLATE_VARIABLE_REGEX);
  for (const match of matches) {
    const variableMatch = match[1];
    if (!variableMatch) continue;
    const variable = variableMatch.trim().toLowerCase();
    if (!knownVariables.includes(variable)) {
      unrecognized.push(match[0]);
    }
  }

  return {
    valid: unrecognized.length === 0,
    unrecognized,
  };
}
