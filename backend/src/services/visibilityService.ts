/**
 * Visibility Service
 *
 * Evaluates field visibility rules based on current field values.
 * Used during signing to determine which fields should be shown/hidden.
 */

import {
  Field,
  VisibilityRules,
  VisibilityCondition,
} from '@/models/Field';

/**
 * Field value map for evaluation
 * Maps field IDs to their current values
 */
export interface FieldValueMap {
  [fieldId: string]: string | number | boolean | null | undefined;
}

/**
 * Evaluate a single visibility condition
 */
function evaluateCondition(
  condition: VisibilityCondition,
  fieldValues: FieldValueMap,
  allFields: Field[]
): boolean {
  const { fieldId, comparison, value } = condition;
  const currentValue = fieldValues[fieldId];

  // Find the referenced field to know its type
  const referencedField = allFields.find((f) => f.id === fieldId);
  if (!referencedField) {
    // Field not found, condition fails
    return false;
  }

  switch (comparison) {
    case 'equals':
      return currentValue === value;

    case 'not_equals':
      return currentValue !== value;

    case 'contains':
      if (typeof currentValue === 'string' && typeof value === 'string') {
        return currentValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;

    case 'not_empty':
      if (currentValue === null || currentValue === undefined) {
        return false;
      }
      if (typeof currentValue === 'string') {
        return currentValue.trim() !== '';
      }
      return true;

    case 'is_empty':
      if (currentValue === null || currentValue === undefined) {
        return true;
      }
      if (typeof currentValue === 'string') {
        return currentValue.trim() === '';
      }
      return false;

    case 'is_checked':
      // For checkbox fields
      if (referencedField.isCheckbox()) {
        return currentValue === true || currentValue === 'true';
      }
      return false;

    case 'is_not_checked':
      // For checkbox fields
      if (referencedField.isCheckbox()) {
        return currentValue !== true && currentValue !== 'true';
      }
      return false;

    default:
      return false;
  }
}

/**
 * Evaluate visibility rules for a field
 *
 * @param rules - The visibility rules to evaluate
 * @param fieldValues - Map of field IDs to their current values
 * @param allFields - All fields in the document (for type checking)
 * @returns true if the field should be visible, false otherwise
 */
export function evaluateVisibility(
  rules: VisibilityRules | null,
  fieldValues: FieldValueMap,
  allFields: Field[]
): boolean {
  // No rules means always visible
  if (!rules || rules.conditions.length === 0) {
    return true;
  }

  const { operator, conditions } = rules;

  if (operator === 'and') {
    // All conditions must be true
    return conditions.every((condition) =>
      evaluateCondition(condition, fieldValues, allFields)
    );
  } else {
    // At least one condition must be true
    return conditions.some((condition) =>
      evaluateCondition(condition, fieldValues, allFields)
    );
  }
}

/**
 * Get visibility state for all fields in a document
 *
 * @param fields - All fields in the document
 * @param fieldValues - Map of field IDs to their current values
 * @returns Map of field IDs to their visibility state
 */
export function getFieldVisibilityStates(
  fields: Field[],
  fieldValues: FieldValueMap
): Map<string, boolean> {
  const visibilityMap = new Map<string, boolean>();

  for (const field of fields) {
    const isVisible = evaluateVisibility(
      field.visibility_rules,
      fieldValues,
      fields
    );
    visibilityMap.set(field.id, isVisible);
  }

  return visibilityMap;
}

/**
 * Get only visible fields based on current values
 *
 * @param fields - All fields in the document
 * @param fieldValues - Map of field IDs to their current values
 * @returns Array of fields that should be visible
 */
export function getVisibleFields(
  fields: Field[],
  fieldValues: FieldValueMap
): Field[] {
  return fields.filter((field) =>
    evaluateVisibility(field.visibility_rules, fieldValues, fields)
  );
}

/**
 * Validate visibility rules for a field
 * Checks for circular references and invalid field IDs
 *
 * @param field - The field with visibility rules
 * @param allFields - All fields in the document
 * @returns Validation result with errors if any
 */
export function validateVisibilityRules(
  field: Field,
  allFields: Field[]
): { valid: boolean; errors: string[] } {
  const allFieldIds = allFields.map((f) => f.id);
  return field.validateVisibilityRules(allFieldIds);
}

/**
 * Check if field is required considering visibility
 * A hidden field should not be considered required
 *
 * @param field - The field to check
 * @param fieldValues - Map of field IDs to their current values
 * @param allFields - All fields in the document
 * @returns true if the field is required and visible
 */
export function isFieldRequiredAndVisible(
  field: Field,
  fieldValues: FieldValueMap,
  allFields: Field[]
): boolean {
  if (!field.required) {
    return false;
  }

  return evaluateVisibility(field.visibility_rules, fieldValues, allFields);
}

/**
 * Get all required visible fields that are not yet filled
 *
 * @param fields - All fields in the document
 * @param fieldValues - Map of field IDs to their current values
 * @returns Array of required fields that are visible and not yet filled
 */
export function getUnfilledRequiredFields(
  fields: Field[],
  fieldValues: FieldValueMap
): Field[] {
  return fields.filter((field) => {
    // Must be required
    if (!field.required) {
      return false;
    }

    // Must be visible
    if (!evaluateVisibility(field.visibility_rules, fieldValues, fields)) {
      return false;
    }

    // Must be unfilled
    const value = fieldValues[field.id];
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return true;
    }

    return false;
  });
}
