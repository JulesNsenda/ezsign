import React, { useMemo } from 'react';
import type { CalculationConfig, Field } from '@/types';

interface CalculatedFieldInputProps {
  calculation: CalculationConfig;
  fields: Field[];
  fieldValues: Map<string, string | number | boolean | null>;
  onSave?: (value: string | number | null) => void;
  onClose?: () => void;
}

/**
 * Display component for calculated fields during signing
 * Shows the calculated value as read-only with formula information
 */
export const CalculatedFieldInput: React.FC<CalculatedFieldInputProps> = ({
  calculation,
  fields,
  fieldValues,
  onSave,
  onClose,
}) => {
  const calculatedValue = useMemo(() => {
    return evaluateCalculation(calculation, fieldValues);
  }, [calculation, fieldValues]);

  const formulaDescription = useMemo(() => {
    switch (calculation.formula) {
      case 'sum':
        return 'Sum of selected fields';
      case 'average':
        return 'Average of selected fields';
      case 'min':
        return 'Minimum of selected fields';
      case 'max':
        return 'Maximum of selected fields';
      case 'count':
        return 'Count of non-empty fields';
      case 'concat':
        return 'Concatenation of selected fields';
      case 'today':
        return "Today's date";
      default:
        return 'Calculated value';
    }
  }, [calculation.formula]);

  // Get names of referenced fields
  const referencedFieldNames = useMemo(() => {
    if (!calculation.fields || calculation.fields.length === 0) {
      return [];
    }
    return calculation.fields
      .map((fieldId) => {
        const field = fields.find((f) => f.id === fieldId);
        return field?.properties?.placeholder || `Field ${fieldId.slice(0, 8)}`;
      })
      .filter(Boolean);
  }, [calculation.fields, fields]);

  return (
    <div className="flex flex-col gap-4" role="region" aria-label="Calculated field value">
      <div className="text-sm text-base-content/60 mb-2" id="calc-field-description">
        <span className="font-semibold">{formulaDescription}</span>
        {referencedFieldNames.length > 0 && (
          <span className="block text-xs text-base-content/40 mt-1">
            Based on: {referencedFieldNames.join(', ')}
          </span>
        )}
      </div>

      {/* Calculated Value Display */}
      <div
        className="bg-base-200 rounded-lg p-4 text-center"
        role="status"
        aria-live="polite"
        aria-describedby="calc-field-description"
      >
        <div className="text-2xl font-bold text-base-content" aria-label={`Calculated value: ${calculatedValue !== null && calculatedValue !== undefined ? String(calculatedValue) : 'Not available'}`}>
          {calculatedValue !== null && calculatedValue !== undefined
            ? String(calculatedValue)
            : '—'}
        </div>
        <div className="text-xs text-base-content/50 mt-2 flex items-center justify-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          Auto-calculated (read-only)
        </div>
      </div>

      {/* Formula Details */}
      <div className="bg-base-100 border border-base-300 rounded-lg p-3">
        <div className="text-xs text-base-content/60">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Formula:</span>
            <span className="px-2 py-0.5 bg-secondary/10 text-secondary rounded">
              {calculation.formula.toUpperCase()}
            </span>
          </div>
          {calculation.separator !== undefined && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Separator:</span>
              <code className="px-2 py-0.5 bg-base-200 rounded">
                "{calculation.separator}"
              </code>
            </div>
          )}
          {calculation.precision !== undefined && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Decimal places:</span>
              <span>{calculation.precision}</span>
            </div>
          )}
          {calculation.format && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">Date format:</span>
              <span>{calculation.format}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {(onSave || onClose) && (
        <div className="flex justify-end gap-2 pt-4 border-t border-base-300">
          {onClose && (
            <button className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
          )}
          {onSave && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onSave(calculatedValue)}
            >
              Accept Value
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Evaluate a calculation based on field values
 */
export function evaluateCalculation(
  calculation: CalculationConfig,
  fieldValues: Map<string, string | number | boolean | null>
): string | number | null {
  const { formula, fields, separator, format, precision } = calculation;

  switch (formula) {
    case 'sum': {
      if (!fields || fields.length === 0) return 0;
      let sum = 0;
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          if (!isNaN(num)) {
            sum += num;
          }
        }
      }
      return precision !== undefined ? Number(sum.toFixed(precision)) : sum;
    }

    case 'average': {
      if (!fields || fields.length === 0) return 0;
      let sum = 0;
      let count = 0;
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          if (!isNaN(num)) {
            sum += num;
            count++;
          }
        }
      }
      const avg = count > 0 ? sum / count : 0;
      return precision !== undefined ? Number(avg.toFixed(precision)) : avg;
    }

    case 'min': {
      if (!fields || fields.length === 0) return null;
      let min: number | null = null;
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          if (!isNaN(num)) {
            if (min === null || num < min) {
              min = num;
            }
          }
        }
      }
      return min !== null && precision !== undefined ? Number(min.toFixed(precision)) : min;
    }

    case 'max': {
      if (!fields || fields.length === 0) return null;
      let max: number | null = null;
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          if (!isNaN(num)) {
            if (max === null || num > max) {
              max = num;
            }
          }
        }
      }
      return max !== null && precision !== undefined ? Number(max.toFixed(precision)) : max;
    }

    case 'count': {
      if (!fields || fields.length === 0) return 0;
      let count = 0;
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          count++;
        }
      }
      return count;
    }

    case 'concat': {
      if (!fields || fields.length === 0) return '';
      const sep = separator !== undefined ? separator : ' ';
      const parts: string[] = [];
      for (const fieldId of fields) {
        const value = fieldValues.get(fieldId);
        if (value !== null && value !== undefined && value !== '') {
          parts.push(String(value));
        }
      }
      return parts.join(sep);
    }

    case 'today': {
      const date = new Date();
      switch (format) {
        case 'locale':
          return date.toLocaleDateString();
        case 'short':
          return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        case 'iso':
        default:
          return date.toISOString().split('T')[0] || '';
      }
    }

    default:
      return null;
  }
}

export default CalculatedFieldInput;
