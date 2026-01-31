import React, { useState, useCallback, useEffect } from 'react';
import Button from './Button';
import { useFieldValidation } from '@/hooks/useValidationPatterns';
import type { ValidationConfig } from '@/types';

interface TextareaFieldInputProps {
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  onSave: (value: string) => void;
  onCancel?: () => void;
  validation?: ValidationConfig;
}

/**
 * Input component for multi-line text fields during signing
 * Supports validation patterns with real-time feedback
 */
export const TextareaFieldInput: React.FC<TextareaFieldInputProps> = ({
  placeholder = 'Enter your text here...',
  maxLength = 1000,
  rows = 4,
  onSave,
  onCancel,
  validation,
}) => {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  const { error, isValid, validate, clearError, example } = useFieldValidation(validation);

  // Validate on value change after first interaction
  useEffect(() => {
    if (touched && value) {
      validate(value);
    } else if (!value) {
      clearError();
    }
  }, [value, touched, validate, clearError]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (value) {
      validate(value);
    }
  }, [value, validate]);

  const handleSave = () => {
    if (!value.trim()) {
      return;
    }

    const result = validate(value.trim());
    if (!result.valid) {
      setTouched(true);
      return;
    }

    onSave(value);
  };

  const remainingChars = maxLength - value.length;
  const canSave = value.trim() && isValid;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="textarea-input" className="text-sm text-base-content/60 mb-2">
        Enter your text below:
        {validation?.pattern && example && (
          <span id="textarea-example" className="block text-xs text-base-content/40 mt-1">
            Example: {example}
          </span>
        )}
      </label>

      <div className="relative">
        <textarea
          id="textarea-input"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={rows}
          className={`
            w-full px-4 py-3 border-2 rounded-lg text-base resize-none
            bg-base-100 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            ${touched && error ? 'border-error focus:border-error focus:ring-error/30' : ''}
            ${!error && value ? 'border-accent' : 'border-base-300'}
          `}
          autoFocus
          aria-invalid={touched && !!error}
          aria-describedby={[
            touched && error ? 'textarea-error' : null,
            'textarea-char-count',
            validation?.pattern && example ? 'textarea-example' : null,
          ].filter(Boolean).join(' ') || undefined}
        />
        <div
          id="textarea-char-count"
          aria-live="polite"
          aria-atomic="true"
          className={`absolute bottom-2 right-3 text-xs ${
            remainingChars < 50 ? 'text-warning' : 'text-base-content/40'
          } ${remainingChars < 10 ? 'text-error font-semibold' : ''}`}
        >
          {remainingChars} characters remaining
        </div>
      </div>

      {/* Validation error */}
      {touched && error && (
        <div id="textarea-error" role="alert" aria-live="polite" className="text-xs text-error -mt-2">
          {error}
        </div>
      )}

      {/* Validation success indicator */}
      {validation?.pattern && !error && value && (
        <div className="text-xs text-success flex items-center gap-1 -mt-2" aria-live="polite">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Valid format
        </div>
      )}

      {value.trim() && (
        <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <div className="text-xs text-accent font-semibold mb-1">Preview:</div>
          <div className="text-sm text-base-content whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            {value}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-4 border-t border-base-300">
        {onCancel && (
          <Button variant="outline" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={!canSave}
        >
          Confirm Text
        </Button>
      </div>
    </div>
  );
};

export default TextareaFieldInput;
